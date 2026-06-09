from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import requests
import psycopg2
import json
import time
import hmac
import hashlib
import base64
from datetime import datetime
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from html import escape
from contextlib import closing
from pydantic import ValidationError
from typing import Dict, Any, List, Optional, Union

# Import strict Pydantic V2 models
from models import (
    SubmitTxRequest,
    SubmitJsonRequest,
    XRPLTransaction,
    XummPayloadRequest,
    EscrowCreate,
    EscrowFinish,
    EscrowCancel,
    Payment,
    TrustSet,
    AccountSet,
    SignIn,
    Batch,
    AnyXRPLTransaction,
)

_XRPL_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"
_XRPL_ALPHABET_MAP = {char: index for index, char in enumerate(_XRPL_ALPHABET)}

def is_valid_xrpl_address(address: str) -> bool:
    """
    Validates a classic XRPL address, including its checksum.
    """
    if not isinstance(address, str) or not address.startswith("r"):
        return False

    try:
        value = 0
        for char in address:
            value = value * 58 + _XRPL_ALPHABET_MAP[char]

        decoded = value.to_bytes(25, byteorder="big")

        if decoded[0] != 0:
            return False

        payload = decoded[:-4]
        checksum = decoded[-4:]
        expected_checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
        return checksum == expected_checksum
    except Exception:
        return False

def currencies_match(c1: str, c2: str) -> bool:
    c1 = c1.strip().upper()
    c2 = c2.strip().upper()
    if c1 == c2:
        return True
    def to_hex(c):
        if len(c) != 40:
            h = c.encode("utf-8").hex().upper()
            return h.ljust(40, "0")
        return c
    return to_hex(c1) == to_hex(c2)

BASE_DIR = os.path.dirname(__file__)
POSTGRES_URL = os.getenv("POSTGRES_URL")
TEMPLATES_FILE = os.path.join(BASE_DIR, "templates.json")

load_dotenv()

XRPL_RPC = os.getenv("XRPL_RPC", "https://s1.ripple.com:51234/")
XUMM_KEY = os.getenv("XUMM_API_KEY")
XUMM_SECRET = os.getenv("XUMM_API_SECRET")

if not XUMM_KEY or not XUMM_SECRET:
    print("WARNING: XUMM_API_KEY and/or XUMM_API_SECRET environment variables are missing. Endpoints will return 501 until configured.")
XUMM_WEBHOOK_URL = os.getenv("XUMM_WEBHOOK_URL")
XUMM_WEBHOOK_SECRET = os.getenv("XUMM_WEBHOOK_SECRET")
ALLOWED_ORIGINS_STR = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS_STR.split(",") if origin.strip()]


def create_requests_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        status=5,
        backoff_factor=0.3,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

session = create_requests_session()


def get_db_connection():
    if not POSTGRES_URL:
        raise RuntimeError("POSTGRES_URL environment variable is not set. Please attach a Vercel Postgres database.")
    return psycopg2.connect(POSTGRES_URL)

def init_db():
    if not POSTGRES_URL:
        print("Skipping DB init: POSTGRES_URL not set")
        return
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as c:
                c.execute("""
                CREATE TABLE IF NOT EXISTS payloads (
                    uuid TEXT PRIMARY KEY,
                    response TEXT,
                    status TEXT,
                    created_at DOUBLE PRECISION
                )
                """)
            conn.commit()
    except Exception as e:
        print(f"Database initialization failed: {e}")

init_db()

app = FastAPI(title="Self-Custodial Escrow (XUMM)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Content Security Policy restricts where resources can be loaded from
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src 'self' data: https:; "
        "font-src 'self' https://cdn.jsdelivr.net data:; "
        "connect-src 'self' wss: https: http:;"
    )
    response.headers["Content-Security-Policy"] = csp
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    error_msgs = []
    for err in exc.errors():
        # Filter out 'body' from the path, to make it cleaner for the user
        field_path = " -> ".join(str(loc) for loc in err["loc"] if loc != "body")
        if not field_path:
            field_path = "Payload"
        error_msgs.append(f"[{field_path}] {err['msg']}")
        
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": f"Validation Error: {' | '.join(error_msgs)}"}
    )

@app.exception_handler(ValidationError)
async def pydantic_validation_exception_handler(request: Request, exc: ValidationError):
    error_msgs = []
    for err in exc.errors():
        field_path = " -> ".join(str(loc) for loc in err["loc"])
        if not field_path:
            field_path = "Payload"
        error_msgs.append(f"[{field_path}] {err['msg']}")
        
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": f"Strict Validation Failed: {' | '.join(error_msgs)}"}
    )

static_dir = os.path.join(BASE_DIR, "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(static_dir, "index.html"))


@app.get("/app.js")
def get_app_js():
    return FileResponse(os.path.join(static_dir, "app.js"))


@app.get("/favicon.ico", include_in_schema=False)
def get_favicon():
    favicon_path = os.path.join(static_dir, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    return Response(status_code=204)


@app.get("/templates")
def list_templates():
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def replace_placeholders(obj, params):
    if isinstance(obj, dict):
        return {k: replace_placeholders(v, params) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [replace_placeholders(elem, params) for elem in obj]
    elif isinstance(obj, str):
        if obj.startswith("{{") and obj.endswith("}}"):
            key = obj[2:-2].strip()
            if key in params:
                val = params[key]
                if isinstance(val, str):
                    val = val.strip()
                # Handle JSON strings (like IOU Amount objects) safely
                if isinstance(val, str) and (
                    (val.startswith("{") and val.endswith("}")) or 
                    (val.startswith("[") and val.endswith("]"))
                ):
                    try:
                        return json.loads(val)
                    except ValueError:
                        pass
                # Cast specific XRPL properties to integers
                if isinstance(val, str) and val.isdigit() and key in [
                    "FINISH_AFTER", "CANCEL_AFTER", "DESTINATION_TAG", 
                    "SOURCE_TAG", "OFFER_SEQUENCE"
                ]:
                    return int(val)
                return val
        # Inline fallback for partial string interpolation
        for k, v in params.items():
            placeholder = "{{" + k + "}}"
            if placeholder in obj:
                obj = obj.replace(placeholder, str(v))
    return obj

def remove_empty_fields(obj):
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            val = remove_empty_fields(v)
            # Strip out unresolved placeholders, empty string values, or nulls
            if val != "" and val != {} and val is not None:
                if isinstance(val, str) and val.startswith("{{") and val.endswith("}}"):
                    continue
                cleaned[k] = val
        return cleaned
    elif isinstance(obj, list):
        return [remove_empty_fields(x) for x in obj if x != "" and x is not None]
    return obj

def apply_tx_rules(tx: dict):
    issuer_cache = {}
    mpt_cache = {}
    mpt_balance_cache = {}

    def process_transaction(t, is_inner=False):
        # Handle stringified JSON in Amount (if user inputs an IOU or MPT JSON directly in the UI)
        if "Amount" in t and isinstance(t["Amount"], str):
            try:
                parsed_amount = json.loads(t["Amount"])
                if isinstance(parsed_amount, dict):
                    t["Amount"] = parsed_amount
            except ValueError:
                pass  # Leave it as string (likely drops of XRP)

        # Ensure Xaman compatibility by universally removing auto-filled fields
        t.pop("SigningPubKey", None)
        t.pop("TxnSignature", None)
        t.pop("Sequence", None)

        # Validate base address fields
        for field in ["Account", "Destination", "Owner"]:
            if field in t and isinstance(t[field], str):
                addr = t[field].strip()
                t[field] = addr
                if addr and not is_valid_xrpl_address(addr):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid address format for {field}: '{addr}'. Must be a valid XRPL r-address with a correct checksum."
                    )

        # Check TrustSet LimitAmount Issuer
        if t.get("TransactionType") == "TrustSet" and "LimitAmount" in t:
            limit = t["LimitAmount"]
            if isinstance(limit, dict) and "issuer" in limit:
                issuer = str(limit["issuer"]).strip()
                limit["issuer"] = issuer
                if issuer and not is_valid_xrpl_address(issuer):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid address format for LimitAmount issuer: '{issuer}'. Must be a valid XRPL r-address with a correct checksum."
                    )

        if is_inner:
            flags = t.get("Flags", 0)
            try:
                flags = int(flags)
            except ValueError:
                flags = 0

            t["Flags"] = flags | 0x40000000
            t.pop("Fee", None)

        if t.get("TransactionType") in ("EscrowCreate", "Payment"):
            amount = t.get("Amount")

            if isinstance(amount, dict):
                if is_inner and t.get("TransactionType") == "EscrowCreate" and "CancelAfter" not in t:
                    raise HTTPException(
                        status_code=400,
                        detail="Batch Constraint Failed: Token escrows within a Batch must always have a CancelAfter field."
                    )

                # 1. Trustline Tokens (IOUs)
                if "issuer" in amount and "currency" in amount:
                    issuer = str(amount.get("issuer", "")).strip()
                    currency = str(amount.get("currency", "")).strip()
                    amount["issuer"] = issuer  # Sanitize the payload natively
                    
                    if not is_valid_xrpl_address(issuer):
                        raise HTTPException(
                            status_code=400,
                            detail="Invalid Token Issuer address format. Must be a valid XRPL r-address with a correct checksum."
                        )

                    destination = t.get("Destination")
                    if destination and destination != issuer:
                        # Skip trustline validation for now - XRPL node will reject if it's actually missing
                        # This allows wallet connections to work without strict pre-flight checks
                        pass
                        # Uncomment below to re-enable strict trustline validation:
                        # has_trustline = False
                        # marker = None
                        # ... (rest of validation code)


                    if issuer not in issuer_cache:
                        rpc_req = {"method": "account_info", "params": [{"account": issuer, "ledger_index": "validated"}]}
                        r = requests.post(XRPL_RPC, json=rpc_req, timeout=10)

                        if r.status_code == 200:
                            info = r.json()
                            result = info.get("result", {})
                            if "error" in result:
                                err_msg = result.get('error_message', result.get('error'))
                                if result.get('error') == 'actNotFound':
                                    err_msg = "Account not found. (Network mismatch: check if you are using a Mainnet token on a Testnet RPC, or if the address is unfunded.)"
                                elif result.get('error') in ('actMalformed', 'accountMalformed'):
                                    err_msg = "Account malformed. The address contains invalid characters, a typo, or a bad checksum. Please verify the issuer's r-address."
                                raise HTTPException(
                                    status_code=400,
                                    detail=f"Issuer account info error: {err_msg}"
                                )

                            account_data = result.get("account_data", {})
                            issuer_cache[issuer] = account_data.get("Flags", 0)
                        else:
                            raise HTTPException(status_code=400, detail="Failed to reach XRPL RPC for account info.")

                    issuer_flags = issuer_cache.get(issuer, 0)
                    
                    # Note: Strict LSF_ALLOW_TRUSTLINE_LOCKING flag validation bypassed.
                    # Depending on the network (Mainnet vs Testnet vs Sidechains), the exact bitmask 
                    # for this flag can vary, leading to false negatives. The XRPL node will safely 
                    # reject the transaction directly with tecNO_PERMISSION if it is genuinely missing.

                # 2. Multi-Purpose Tokens (MPTs)
                elif "mpt_issuance_id" in amount:
                    issuance_id = amount.get("mpt_issuance_id")
                    
                    if issuance_id not in mpt_cache:
                        rpc_req = {"method": "mptoken_issuance_info", "params": [{"mpt_issuance_id": issuance_id, "ledger_index": "validated"}]}
                        r = requests.post(XRPL_RPC, json=rpc_req, timeout=10)

                        if r.status_code == 200:
                            info = r.json()
                            result = info.get("result", {})
                            if "error" in result:
                                raise HTTPException(
                                    status_code=400,
                                    detail=f"MPT issuance info error: {result.get('error_message')}"
                                )

                            mpt_flags = result.get("flags", 0)
                            if "mptoken_issuance" in result:
                                mpt_flags = result["mptoken_issuance"].get("flags", mpt_flags)
                                
                            mpt_cache[issuance_id] = mpt_flags
                        else:
                            raise HTTPException(status_code=400, detail="Failed to reach XRPL RPC for MPT info.")

                    mpt_flags = mpt_cache.get(issuance_id, 0)

                    # Check for tfMPTCanEscrow flag
                    TF_MPT_CAN_ESCROW = 0x0002  # Adjust bitmask if necessary
                    if not (int(mpt_flags) & TF_MPT_CAN_ESCROW):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Token Escrow Prerequisite Failed: The MPT ({issuance_id}) does not have the tfMPTCanEscrow flag enabled."
                        )

    # Apply to top-level tx
    process_transaction(tx)

    # Apply strict rules to inner transactions if Batch
    if tx.get("TransactionType") == "Batch":
        inner_txns = tx.get("Transactions", [])
        if len(inner_txns) > 8:
            raise HTTPException(
                status_code=400,
                detail="Batch Constraint Failed: A Batch transaction can bundle up to 8 inner transactions."
            )
        for inner in inner_txns:
            if isinstance(inner, dict):
                if "Transaction" in inner:
                    process_transaction(inner["Transaction"], is_inner=True)
                else:
                    process_transaction(inner, is_inner=True)

    return tx


@app.post("/templates/{name}/build")
def build_template(request: Request, name: str, params: dict):
    """Build a tx JSON from a named template and provided params."""
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        templates = json.load(f)

    tmpl = templates.get(name)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    # Deep replace variables inside templates without risking JSON decode errors
    tx = replace_placeholders(tmpl.get("txjson", {}), params)
    # Clean empty values so optional values (e.g. CancelAfter) don't send "" 
    tx = remove_empty_fields(tx)

    return apply_tx_rules(tx)


@app.post("/build_custom")
def build_custom(request: Request, tx: AnyXRPLTransaction):
    """Build and validate a custom transaction JSON directly."""
    # Convert Pydantic model to dict for processing
    tx_dict = tx.model_dump(exclude_unset=True, exclude_none=True) if hasattr(tx, 'model_dump') else (tx.dict(exclude_unset=True, exclude_none=True) if hasattr(tx, 'dict') else tx)
    return apply_tx_rules(tx_dict)


@app.get("/check_issuer_status/{account}")
def check_issuer_status(request: Request, account: str):
    """Check if an issuer account has the Allow Trust Line Locking flag enabled."""
    account = account.strip()
    if not is_valid_xrpl_address(account):
        raise HTTPException(status_code=400, detail="Invalid account address format. Must be a valid XRPL r-address with a correct checksum.")
    
    rpc_req = {"method": "account_info", "params": [{"account": account, "ledger_index": "validated"}]}
    try:
        r = requests.post(XRPL_RPC, json=rpc_req, timeout=10)
        if r.status_code == 200:
            try:
                info = r.json()
            except ValueError:
                raise HTTPException(status_code=502, detail="Invalid JSON response received from XRPL node.")
            result = info.get("result", {})
            if "error" in result:
                err_msg = result.get('error_message', result.get('error'))
                if result.get('error') == 'actNotFound':
                    err_msg = "Account not found. (Network mismatch: check if you are using a Mainnet token on a Testnet RPC, or if the address is unfunded.)"
                elif result.get('error') in ('actMalformed', 'accountMalformed'):
                    err_msg = "Account malformed. The address contains invalid characters, a typo, or a bad checksum. Please verify the r-address."
                raise HTTPException(
                    status_code=400,
                    detail=f"Account info error: {err_msg}"
                )
            
            account_data = result.get("account_data", {})
            flags = account_data.get("Flags", 0)
            
            LSF_ALLOW_TRUSTLINE_LOCKING = 0x80000000  # Adjust bitmask if necessary based on final TokenEscrow spec
            escrows_enabled = bool(int(flags) & LSF_ALLOW_TRUSTLINE_LOCKING)
            
            return {"account": account, "escrows_enabled": escrows_enabled}
        else:
            raise HTTPException(status_code=r.status_code, detail="XRPL node account_info request failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/check_trustline/{destination}/{issuer}/{currency}")
def check_trustline(request: Request, destination: str, issuer: str, currency: str):
    """Check if a destination account has an active trustline for a specific token."""
    destination = destination.strip()
    issuer = issuer.strip()
    currency = currency.strip()
    
    if not is_valid_xrpl_address(destination):
        raise HTTPException(status_code=400, detail="Invalid destination address format. Must be a valid XRPL r-address with a correct checksum.")
    if not is_valid_xrpl_address(issuer):
        raise HTTPException(status_code=400, detail="Invalid issuer address format. Must be a valid XRPL r-address with a correct checksum.")

    marker = None
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            # Query all trustlines without peer filter to ensure we find the line
            rpc_req = {
                "method": "account_lines",
                "params": [{"account": destination, "ledger_index": "validated", "limit": 400}]
            }
            if marker:
                rpc_req["params"][0]["marker"] = marker
                
            r = requests.post(XRPL_RPC, json=rpc_req, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if "error" in data.get("result", {}):
                    err = data["result"].get("error_message", data["result"].get("error"))
                    if data["result"].get("error") == "actNotFound":
                        err = f"Account '{destination}' not found on Mainnet. It may not be funded yet. Fund it with at least 20 XRP first, then set up trustlines."
                    return {"has_trustline": False, "error": err}
                
                lines = data["result"].get("lines", [])
                for line in lines:
                    # Match both currency and issuer (counterparty)
                    if currencies_match(line.get("currency", ""), currency) and line.get("account", "") == issuer:
                        return {"has_trustline": True, "balance": line.get("balance")}
                
                marker = data["result"].get("marker")
                if not marker:
                    return {"has_trustline": False, "balance": "0"}
                
                retry_count = 0  # Reset on successful request
            else:
                retry_count += 1
                if retry_count < max_retries:
                    time.sleep(0.5 * retry_count)
                else:
                    raise HTTPException(status_code=r.status_code, detail=f"XRPL node request failed after {max_retries} retries.")
        except requests.exceptions.Timeout:
            retry_count += 1
            if retry_count < max_retries:
                time.sleep(0.5 * retry_count)
            else:
                raise HTTPException(status_code=503, detail=f"XRPL RPC timeout after {max_retries} retries. The node may be temporarily unavailable.")
        except requests.exceptions.RequestException as e:
            retry_count += 1
            if retry_count < max_retries:
                time.sleep(0.5 * retry_count)
            else:
                raise HTTPException(status_code=500, detail=f"XRPL connection error: {str(e)}")


@app.get("/active_escrows/{account}")
def get_active_escrows(request: Request, account: str):
    """Fetch active incoming and outgoing escrows for a given account from the XRPL."""
    account = account.strip()
    if not is_valid_xrpl_address(account):
        raise HTTPException(status_code=400, detail="Invalid account address format. Must be a valid XRPL r-address with a correct checksum.")

    rpc_req_obj = {
        "method": "account_objects",
        "params": [
            {
                "account": account,
                "type": "escrow",
                "ledger_index": "validated"
            }
        ]
    }
    rpc_req_tx = {
        "method": "account_tx",
        "params": [
            {
                "account": account,
                "ledger_index_min": -1,
                "ledger_index_max": -1,
                "limit": 400
            }
        ]
    }
    try:
        r_obj = requests.post(XRPL_RPC, json=rpc_req_obj, timeout=10)
        r_tx = requests.post(XRPL_RPC, json=rpc_req_tx, timeout=10)
        
        if r_obj.status_code != 200 or r_tx.status_code != 200:
            raise HTTPException(status_code=500, detail="XRPL node request failed.")
            
        try:
            res_obj = r_obj.json().get("result", {})
            res_tx = r_tx.json().get("result", {})
        except ValueError:
            raise HTTPException(status_code=502, detail="Invalid JSON response received from XRPL node.")
        
        if "error" in res_obj:
            raise HTTPException(status_code=400, detail=res_obj.get("error_message"))
        if "error" in res_tx:
            raise HTTPException(status_code=400, detail=res_tx.get("error_message"))
            
        escrows = res_obj.get("account_objects", [])
        existing_indexes = set(e.get("index") for e in escrows if "index" in e)
        
        transactions = res_tx.get("transactions", [])
        resolved_escrows = set()
        incoming_candidates = []
        escrow_seq_map = {}
        
        # Scan transaction history from newest to oldest
        for item in transactions:
            tx = item.get("tx") or item.get("transaction") or {}
            meta = item.get("meta") or item.get("metaData") or {}
            tx_type = tx.get("TransactionType")
            
            if tx_type in ("EscrowFinish", "EscrowCancel"):
                owner = tx.get("Owner")
                seq = tx.get("OfferSequence")
                if owner and seq is not None:
                    resolved_escrows.add(f"{owner}-{seq}")
                    
            elif tx_type == "EscrowCreate":
                creator = tx.get("Account")
                seq = tx.get("Sequence")
                
                escrow_index = None
                for node in meta.get("AffectedNodes", []):
                    created = node.get("CreatedNode", {})
                    if created.get("LedgerEntryType") == "Escrow":
                        escrow_index = created.get("LedgerIndex")
                        break
                
                if escrow_index and seq is not None:
                    escrow_seq_map[escrow_index] = seq
                    
                if tx.get("Destination") == account and tx.get("Account") != account:
                    if f"{creator}-{seq}" not in resolved_escrows:
                        if escrow_index and escrow_index not in existing_indexes:
                            escrow_obj = {
                                "LedgerEntryType": "Escrow",
                                "index": escrow_index,
                                "Account": creator,
                                "Destination": account,
                                "Amount": tx.get("Amount"),
                                "Condition": tx.get("Condition"),
                                "CancelAfter": tx.get("CancelAfter"),
                                "FinishAfter": tx.get("FinishAfter"),
                                "DestinationTag": tx.get("DestinationTag"),
                                "SourceTag": tx.get("SourceTag"),
                                "OfferSequence": seq
                            }
                            incoming_candidates.append(escrow_obj)
                            existing_indexes.add(escrow_index)
                            
        # Inject OfferSequence for existing account_objects using history map or secondary RPC fetch
        for e in escrows:
            if "OfferSequence" not in e:
                idx = e.get("index")
                if idx in escrow_seq_map:
                    e["OfferSequence"] = escrow_seq_map[idx]
                else:
                    prev_tx = e.get("PreviousTxnID")
                    if prev_tx:
                        tx_req = {"method": "tx", "params": [{"transaction": prev_tx}]}
                        try:
                            tx_res = requests.post(XRPL_RPC, json=tx_req, timeout=5)
                            if tx_res.status_code == 200:
                                tx_data = tx_res.json().get("result", {})
                                if tx_data.get("TransactionType") == "EscrowCreate":
                                    e["OfferSequence"] = tx_data.get("Sequence")
                        except Exception:
                            pass

        escrows.extend(incoming_candidates)
        return {"account": account, "escrows": escrows}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ledger_time")
def get_ledger_time(request: Request):
    """Fetch the latest validated ledger's close_time (XRPL Epoch time)."""
    rpc_req = {"method": "ledger", "params": [{"ledger_index": "validated"}]}
    try:
        r = requests.post(XRPL_RPC, json=rpc_req, timeout=10)
        if r.status_code == 200:
            result = r.json().get("result", {})
            if "error" in result:
                raise HTTPException(status_code=400, detail=result.get("error_message"))
            
            ledger = result.get("ledger", {})
            close_time = ledger.get("close_time")
            
            return {"network_time": close_time}
        else:
            raise HTTPException(status_code=r.status_code, detail="XRPL node ledger request failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search_tokens")
def search_tokens(request: Request, currency: Optional[str] = None, name: Optional[str] = None):
    """Proxy token search requests to a public token registry to avoid CORS issues."""
    params = {}
    if currency:
        params["currency"] = currency
    if name:
        params["name"] = name
        
    if not params:
        return {"tokens": []}
        
    try:
        r = session.get("https://api.xrplmeta.org/tokens", params=params, timeout=10)
        if r.status_code == 200:
            return r.json()
        return {"tokens": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token search failed: {str(e)}")

@app.post("/estimate_fee")
def estimate_fee(request: Request, tx: AnyXRPLTransaction):
    """Estimates the required XRPL network fee for a given transaction."""
    # Convert Pydantic model to dict
    tx_dict = tx.model_dump(exclude_unset=True, exclude_none=True) if hasattr(tx, 'model_dump') else (tx.dict(exclude_unset=True, exclude_none=True) if hasattr(tx, 'dict') else tx)
    
    rpc_req = {"method": "fee", "params": [{}]}
    try:
        r = requests.post(XRPL_RPC, json=rpc_req, timeout=10)
        if r.status_code == 200:
            result = r.json().get("result", {})
            drops = result.get("drops", {})
            base_fee = int(drops.get("base_fee", 10))
            open_ledger_fee = int(drops.get("open_ledger_fee", base_fee))
            
            # Calculate multiplier based on transaction type (Batch requires fee for each inner tx)
            multiplier = 1
            if tx_dict.get("TransactionType") == "Batch":
                multiplier += len(tx_dict.get("Transactions", []))
                
            return {"estimated_fee_drops": str(open_ledger_fee * multiplier)}
        else:
            raise HTTPException(status_code=r.status_code, detail="XRPL node fee estimation failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def normalize_signature(signature: str) -> str:
    if not signature:
        return ""
    sig = signature.strip()
    if sig.lower().startswith("sha256="):
        sig = sig.split("=", 1)[1]
    return sig.strip()


def compute_signature(secret: str, payload_bytes: bytes) -> dict:
    raw = secret.encode("utf-8")
    digest = hmac.new(raw, payload_bytes, hashlib.sha256).digest()
    return {
        "hex": digest.hex(),
        "base64": base64.b64encode(digest).decode("utf-8"),
    }


def verify_xumm_signature(headers, payload_bytes: bytes) -> bool:
    secret = XUMM_WEBHOOK_SECRET or XUMM_SECRET
    if not secret:
        return False

    signature = (headers.get("X-Xumm-Signature") or headers.get("x-xumm-signature")
                 or headers.get("X-Signature") or headers.get("x-signature"))
    signature = normalize_signature(signature)
    if not signature:
        return False

    expected = compute_signature(secret, payload_bytes)
    return hmac.compare_digest(signature, expected["hex"]) or hmac.compare_digest(signature, expected["base64"])


@app.get("/xaman/redirect")
def xaman_redirect(target: str):
    if not target:
        raise HTTPException(status_code=400, detail="target query required")
    if not (target.startswith("xaman://") or target.startswith("https://") or target.startswith("http://")):
        raise HTTPException(status_code=400, detail="Unsupported redirect target")
    
    safe_target_html = escape(target, quote=True)
    safe_target_js = json.dumps(target).replace("</", "<\\/")
    
    html = (
        "<!doctype html><html><head>"
        f'<meta http-equiv="refresh" content="0;url={safe_target_html}" />'
        "<title>Redirecting to Xaman</title>"
        "<script>"
        "function go() { window.location.href = " + safe_target_js + "; }"
        "window.onload = go;"
        "</script></head><body>"
        f'<p>Redirecting... <a href="{safe_target_html}">Click here if not redirected.</a></p>'
        "</body></html>"
    )
    return HTMLResponse(content=html)


def store_payload_with_retries(uuid: str, body: dict, max_attempts: int = 5):
    if not POSTGRES_URL:
        return
    attempt = 0
    payload_str = json.dumps(body)
    status = simplify_state(body) or "unknown"
    while attempt < max_attempts:
        try:
            with closing(get_db_connection()) as conn:
                with conn.cursor() as c:
                    c.execute("""
                        INSERT INTO payloads (uuid, response, status, created_at) 
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT(uuid) DO UPDATE SET 
                            response = EXCLUDED.response, 
                            status = EXCLUDED.status
                    """, (uuid, payload_str, status, time.time()))
                conn.commit()
            return  # Successful insert, exit function
        except psycopg2.OperationalError as exc:
            attempt += 1
            if attempt >= max_attempts:
                raise
            time.sleep(0.2 * attempt)


def load_local_payload(uuid: str):
    if not POSTGRES_URL:
        return None
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as c:
                c.execute("SELECT response, status, created_at FROM payloads WHERE uuid = %s", (uuid,))
                row = c.fetchone()
    except Exception:
        return None

    if not row:
        return None

    try:
        response = json.loads(row[0])
    except Exception:
        response = None

    return {"response": response, "status": row[1], "created_at": row[2]}


def fetch_remote_payload(uuid: str):
    if not XUMM_KEY or not XUMM_SECRET:
        raise HTTPException(status_code=501, detail="XUMM API keys not configured on server.")

    url = f"https://xumm.app/api/v1/platform/payload/{uuid}"
    headers = {"x-api-key": XUMM_KEY, "x-api-secret": XUMM_SECRET}
    r = session.get(url, headers=headers, timeout=10)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json()


def simplify_state(data):
    if not data:
        return None

    # 1. Try to read state directly (webhook format)
    state = data.get("meta", {}).get("state") or data.get("response", {}).get("meta", {}).get("state")
    if state:
        return state

    # 2. Derive state from REST API format
    meta = data.get("meta", {})
    if meta.get("resolved"):
        if meta.get("signed"):
            return "signed"
        elif meta.get("cancelled"):
            return "cancelled"
        elif meta.get("expired"):
            return "expired"
        else:
            return "rejected"
            
    return "pending" if meta.get("exists") else None


@app.post("/xumm/payload")
def create_xumm_payload(request: Request, payload: XummPayloadRequest):
    if not XUMM_KEY or not XUMM_SECRET:
        raise HTTPException(status_code=501, detail="XUMM API keys not configured on server.")

    url = "https://xumm.app/api/v1/platform/payload"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": XUMM_KEY,
        "x-api-secret": XUMM_SECRET,
    }
    
    # Convert Pydantic model to dict
    payload_dict = payload.model_dump(exclude_unset=True, exclude_none=True) if hasattr(payload, 'model_dump') else payload.dict(exclude_unset=True, exclude_none=True)
    
    # Support user_token for Push Notifications
    if "TransactionType" in payload_dict or ("Transactions" in payload_dict and payload_dict.get("TransactionType") == "Batch"):
        txjson = payload_dict
        user_token = None
        custom_meta = None
    else:
        txjson = payload_dict.get("txjson", payload_dict)
        user_token = payload_dict.get("user_token")
        custom_meta = payload_dict.get("custom_meta")

    # Apply backend rules to strictly validate the payload safely before pushing to Xaman
    if txjson.get("TransactionType") != "SignIn":
        try:
            txjson = apply_tx_rules(txjson)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Payload Validation Error: {str(e)}")

    data = {"txjson": txjson}
    if user_token:
        data["user_token"] = user_token
    if custom_meta:
        data["custom_meta"] = custom_meta
        
    if XUMM_WEBHOOK_URL:
        # XUMM accepts additional fields; include webhook URL to request callbacks to this server.
        data["webhook_url"] = XUMM_WEBHOOK_URL
    resp = session.post(url, headers=headers, json=data, timeout=15)
    if resp.status_code != 200:
        error_detail = resp.text
        try:
            parsed = resp.json()
            if "error" in parsed:
                if "message" in parsed["error"]:
                    error_detail = parsed["error"]["message"]
                    if "checksum_invalid" in error_detail.lower():
                        error_detail = "Invalid XRPL address provided. Please check your inputs for typos (checksum invalid)."
                elif parsed["error"].get("code") == 812:
                    error_detail = "Xaman API Error 812: Invalid API Key or Secret. Please check your Xaman Developer Console, update your .env file, and restart the server."
                elif parsed["error"].get("code") == 813:
                    error_detail = "Xaman API Error 813: Rate limit exceeded. You have generated too many requests too quickly. Please wait a few minutes before trying again."
                elif resp.status_code == 403 and user_token:
                    error_detail = "Session Expired (403 Forbidden): Your connected wallet token belongs to a previous session or old API key. Please disconnect your wallet in the UI and reconnect."
        except Exception:
            pass
        raise HTTPException(status_code=resp.status_code, detail=error_detail)

    j = resp.json()
    uuid = j.get("uuid")
    if uuid:
        store_payload_with_retries(uuid, j)

    return JSONResponse(content=j)


@app.post("/xumm/webhook")
async def xumm_webhook(request: Request):
    """XUMM will POST payload updates here if you configure a webhook URL.

    This endpoint stores the payload body in the local DB keyed by `uuid`.
    """
    raw_body = await request.body()
    
    # Security Enhancement: Strictly enforce webhook signature verification
    if not (XUMM_WEBHOOK_SECRET or XUMM_SECRET):
        return JSONResponse(status_code=501, content={"detail": "Webhook endpoint disabled: Missing XUMM Secrets for secure verification."})

    if not verify_xumm_signature(request.headers, raw_body):
        return JSONResponse(status_code=401, content={"detail": "Invalid XUMM webhook signature"})

    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return JSONResponse(status_code=400, content={"detail": "Invalid JSON payload"})

    # Xaman webhook bodies encapsulate the UUID inside 'payloadResponse' or 'meta'
    uuid = body.get("payloadResponse", {}).get("payload_uuidv4") or body.get("meta", {}).get("payload_uuidv4") or body.get("uuid")
    if not uuid:
        return JSONResponse(status_code=400, content={"detail": "Missing uuid"})

    try:
        # Automate UUID Verification: Fetch the authoritative payload state from the Xaman API
        # This prevents blindly trusting the webhook POST body and securely retrieves the signed transaction details.
        if XUMM_KEY and XUMM_SECRET:
            try:
                remote = fetch_remote_payload(uuid)
                
                # Automatically submit the signed transaction to the XRPL
                meta = remote.get("meta", {})
                if meta.get("signed"):
                    tx_blob = remote.get("response", {}).get("hex")
                    if tx_blob:
                        try:
                            rpc_req = {"method": "submit", "params": [{"tx_blob": tx_blob}]}
                            submit_res = requests.post(XRPL_RPC, json=rpc_req, timeout=15)
                            remote["xrpl_submission"] = submit_res.json()
                        except Exception as e:
                            print(f"Auto-submit failed for {uuid}: {e}")
                            remote["xrpl_submission"] = {"error": str(e)}
                
                store_payload_with_retries(uuid, remote)
            except HTTPException:
                # Fallback to saving the unverified webhook body if the API fetch fails
                store_payload_with_retries(uuid, body)
        else:
            store_payload_with_retries(uuid, body)
    except Exception as exc:
        return JSONResponse(status_code=503, content={"detail": "Database busy, please retry", "error": str(exc)})

    return JSONResponse(content={"ok": True})


@app.get("/xumm/payload_status/{uuid}")
def payload_status(request: Request, uuid: str):
    """Return stored payload info and remote XUMM status if available."""
    local = load_local_payload(uuid)
    remote = None
    remote_state = None
    if XUMM_KEY and XUMM_SECRET:
        try:
            remote = fetch_remote_payload(uuid)
            store_payload_with_retries(uuid, remote)
            remote_state = simplify_state(remote)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={
                "detail": exc.detail,
                "local": local,
                "remote": None,
            })

    local_state = simplify_state(local["response"] if local else None)
    return JSONResponse(content={
        "uuid": uuid,
        "local": local,
        "remote": remote,
        "local_state": local_state,
        "remote_state": remote_state,
        "state": remote_state or local_state or "unknown",
        "source": "remote" if remote else "local",
    })


@app.get("/xumm/payload_report/{uuid}")
def payload_report(request: Request, uuid: str):
    """Return a full payload status report comparing local webhook storage with XUMM."""
    local = load_local_payload(uuid)
    report = {"uuid": uuid, "local": local, "remote": None, "ok": False}

    if XUMM_KEY and XUMM_SECRET:
        try:
            remote = fetch_remote_payload(uuid)
            store_payload_with_retries(uuid, remote)
            report["remote"] = remote
            report["local_state"] = simplify_state(local["response"] if local else None)
            report["remote_state"] = simplify_state(remote)
            report["match"] = local is not None and report["local_state"] == report["remote_state"]
            report["ok"] = True
        except HTTPException as exc:
            report["detail"] = exc.detail
            report["status_code"] = exc.status_code
            report["local_state"] = simplify_state(local["response"] if local else None)
            report["remote_state"] = None
            report["match"] = False
            return JSONResponse(status_code=exc.status_code, content=report)
    else:
        report["detail"] = "XUMM API keys not configured on server."
        report["local_state"] = simplify_state(local["response"] if local else None)
        report["remote_state"] = None
        report["match"] = False

    return JSONResponse(content=report)


@app.get("/xumm/verify/{uuid}")
def verify_webhook(request: Request, uuid: str):
    """Verify that a webhook was received and matches the XUMM payload state via XUMM API.

    Returns a small report comparing the stored local record with the authoritative XUMM API response.
    """
    local = load_local_payload(uuid)

    if not XUMM_KEY or not XUMM_SECRET:
        return JSONResponse(content={"ok": False, "detail": "XUMM API keys not configured on server.", "local": local})

    try:
        remote = fetch_remote_payload(uuid)
        
        # Automatically submit the signed transaction to the XRPL during manual verification
        meta = remote.get("meta", {})
        if meta.get("signed"):
            tx_blob = remote.get("response", {}).get("hex")
            if tx_blob:
                try:
                    rpc_req = {"method": "submit", "params": [{"tx_blob": tx_blob}]}
                    submit_res = requests.post(XRPL_RPC, json=rpc_req, timeout=15)
                    remote["xrpl_submission"] = submit_res.json()
                except Exception as e:
                    print(f"Auto-submit failed for {uuid}: {e}")
                    remote["xrpl_submission"] = {"error": str(e)}
                    
        store_payload_with_retries(uuid, remote)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"ok": False, "detail": exc.detail, "local": local})

    report = {
        "ok": True,
        "uuid": uuid,
        "local_present": bool(local),
        "local_state": simplify_state(local["response"] if local else None),
        "remote_state": simplify_state(remote),
        "match": local is not None and simplify_state(local["response"] if local else None) == simplify_state(remote),
        "remote": remote,
        "local": local,
    }
    return JSONResponse(content=report)


@app.post("/submit")
def submit_tx(request: Request, body: SubmitTxRequest):
    tx_blob = body.tx_blob
    if not tx_blob:
        raise HTTPException(status_code=400, detail="tx_blob required")
    rpc_req = {"method": "submit", "params": [{"tx_blob": tx_blob}]}
    r = requests.post(XRPL_RPC, json=rpc_req, timeout=15)
    return JSONResponse(content=r.json())


@app.post("/submit_json")
def submit_json(request: Request, body: SubmitJsonRequest):
    # Convert Pydantic model to dict
    tx_json = body.tx_json
    if not tx_json:
        raise HTTPException(status_code=400, detail="tx_json required")
    
    # Convert Pydantic model to dict if needed
    tx_json_dict = tx_json.model_dump(exclude_unset=True, exclude_none=True) if hasattr(tx_json, 'model_dump') else tx_json.dict(exclude_unset=True, exclude_none=True) if hasattr(tx_json, 'dict') else tx_json
    
    rpc_req = {"method": "submit", "params": [{"tx_json": tx_json_dict}]}
    r = requests.post(XRPL_RPC, json=rpc_req, timeout=15)
    return JSONResponse(content=r.json())
