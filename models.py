"""
Strict Pydantic V2 BaseModel classes for transaction payloads.
Provides comprehensive validation, type enforcement, and size constraints
to offload validation to Rust (via Pydantic V2) and strictly enforce
the shape and size of incoming data.
"""

from typing import Dict, Any, List, Optional, Union, Literal, Annotated
from pydantic import BaseModel, Field, field_validator, ConfigDict
from pydantic.types import conint, constr
from decimal import Decimal


# ============================================================================
# TYPE CONSTRAINTS
# ============================================================================

# XRPL addresses must start with 'r' and be 25-35 characters (including checksum)
XRPLAddress = Annotated[str, Field(
    min_length=25,
    max_length=35,
    pattern=r"^r[1-9A-HJ-NP-Za-km-z]{24,34}$",
    description="Valid XRPL account address (r-address with checksum)"
)]

# Currency codes: 3-char ISO codes or 40-char hex codes
CurrencyCode = Annotated[str, Field(
    min_length=3,
    max_length=40,
    description="3-char ISO code or 40-char hex currency code"
)]

# UUIDs from Xaman
PayloadUUID = Annotated[str, Field(
    min_length=36,
    max_length=36,
    pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    description="UUID v4 from Xaman"
)]

# Transaction blob (hex-encoded signed transaction)
TxBlob = Annotated[str, Field(
    min_length=2,
    max_length=100000,
    pattern=r"^[0-9A-Fa-f]*$",
    description="Hex-encoded transaction blob"
)]

# Fulfillment (hex-encoded SHA-256 preimage, 64-128 chars for SHA-256)
FulfillmentHex = Annotated[str, Field(
    min_length=2,
    max_length=256,
    pattern=r"^[0-9A-Fa-f]*$",
    description="Hex-encoded fulfillment (SHA-256 preimage)"
)]

# Condition (hex-encoded SHA-256 hash, always 64 chars)
ConditionHex = Annotated[str, Field(
    min_length=64,
    max_length=128,
    pattern=r"^[0-9A-Fa-f]*$",
    description="Hex-encoded PREIMAGE-SHA-256 condition"
)]

# Drops: numeric string representing XRP in drops (1 XRP = 1,000,000 drops)
# Max supply: ~100 billion XRP = 10^17 drops
Drops = Annotated[str, Field(
    pattern=r"^\d+$",
    max_length=18,  # 18 digits max (< 10^18)
    description="XRP amount in drops (integers only, no decimals)"
)]

# IOU Amount value: stringified decimal
IOUAmount = Annotated[str, Field(
    pattern=r"^-?\d+(\.\d+)?([eE][+-]?\d+)?$",
    max_length=50,
    description="IOU amount as decimal string (supports scientific notation)"
)]

# Token ID for MPTs
TokenID = Annotated[str, Field(
    min_length=1,
    max_length=256,
    description="MPT issuance ID or identifier"
)]


# ============================================================================
# AMOUNT MODELS
# ============================================================================

class XRPAmount(BaseModel):
    """Represents XRP amount in drops."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    # This is a simple string validation wrapper
    # In actual usage, Amount field will be Union[Drops, IOUAmount, LimitAmount]
    pass


class IOUAmountObject(BaseModel):
    """Represents an IOU (issued token) amount."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    currency: CurrencyCode = Field(description="Currency code (3-char ISO or 40-char hex)")
    issuer: XRPLAddress = Field(description="Token issuer's XRPL address")
    value: IOUAmount = Field(description="Token amount as decimal string")


class MPTAmountObject(BaseModel):
    """Represents a Multi-Purpose Token amount."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    mpt_issuance_id: TokenID = Field(description="MPT issuance ID")
    amount: Annotated[str, Field(
        pattern=r"^\d+$",
        description="MPT amount in integer units"
    )]


class LimitAmountObject(BaseModel):
    """TrustSet LimitAmount structure."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    currency: CurrencyCode
    issuer: XRPLAddress
    value: IOUAmount


# ============================================================================
# TRANSACTION BASE MODELS
# ============================================================================

class TransactionBase(BaseModel):
    """Common fields for all XRPL transactions."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: str = Field(description="Type of transaction")
    Account: XRPLAddress = Field(description="Account initiating the transaction")
    Fee: Optional[Drops] = Field(
        default=None,
        description="Transaction fee in drops (optional, filled by Xaman/server)"
    )
    Sequence: Optional[conint(ge=0)] = Field(
        default=None,
        description="Sequence number (filled by Xaman/server)"
    )
    SigningPubKey: Optional[str] = Field(
        default=None,
        description="Public key (filled by Xaman/server)"
    )
    Flags: Optional[conint(ge=0)] = Field(
        default=None,
        description="Transaction flags"
    )
    SourceTag: Optional[conint(ge=0, le=4294967295)] = Field(
        default=None,
        description="Source tag for payment routing"
    )
    TxnSignature: Optional[str] = Field(
        default=None,
        description="Transaction signature (filled by Xaman/server)"
    )
    LastLedgerSequence: Optional[conint(ge=0)] = Field(
        default=None,
        description="Last ledger index this transaction can be included in"
    )
    Memos: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional public memos attached to the transaction"
    )


class EscrowCreate(TransactionBase):
    """EscrowCreate transaction with strict validation."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["EscrowCreate"]
    Destination: XRPLAddress = Field(description="Destination account for escrow")
    DestinationTag: Optional[conint(ge=0, le=4294967295)] = Field(
        default=None,
        description="Tag for destination account"
    )
    Amount: Union[Drops, IOUAmountObject, MPTAmountObject] = Field(
        description="Amount to escrow (XRP drops or IOU/MPT)"
    )
    Condition: Optional[ConditionHex] = Field(
        default=None,
        description="SHA-256 condition for conditional escrow"
    )
    CancelAfter: Optional[conint(ge=0)] = Field(
        default=None,
        description="XRPL epoch time after which escrow can be cancelled"
    )
    FinishAfter: Optional[conint(ge=0)] = Field(
        default=None,
        description="XRPL epoch time before which escrow cannot be finished"
    )
    
    @field_validator("Amount", mode="before")
    @classmethod
    def validate_amount(cls, v):
        """Validate that Amount is properly formatted."""
        if isinstance(v, str):
            # XRP drops - must be numeric string
            if not v.isdigit():
                raise ValueError("XRP amount must be numeric string (drops)")
            if len(v) > 18:
                raise ValueError("XRP amount exceeds maximum supply")
            return v
        elif isinstance(v, dict):
            # IOU or MPT - validate structure
            if "mpt_issuance_id" in v:
                # MPT amount
                if not ("amount" in v):
                    raise ValueError("MPT amount requires 'amount' field")
            elif "currency" in v and "issuer" in v:
                # IOU amount
                if not ("value" in v):
                    raise ValueError("IOU amount requires 'currency', 'issuer', and 'value'")
            return v
        return v


class EscrowFinish(TransactionBase):
    """EscrowFinish transaction."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["EscrowFinish"]
    Owner: XRPLAddress = Field(description="Original escrow creator")
    OfferSequence: conint(ge=0) = Field(description="Sequence of original EscrowCreate")
    Fulfillment: Optional[FulfillmentHex] = Field(
        default=None,
        description="Hex fulfillment for conditional escrow"
    )


class EscrowCancel(TransactionBase):
    """EscrowCancel transaction."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["EscrowCancel"]
    Owner: XRPLAddress = Field(description="Original escrow creator")
    OfferSequence: conint(ge=0) = Field(description="Sequence of original EscrowCreate")


class Payment(TransactionBase):
    """Payment transaction."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["Payment"]
    Destination: XRPLAddress = Field(description="Payment destination")
    DestinationTag: Optional[conint(ge=0, le=4294967295)] = Field(
        default=None,
        description="Destination tag"
    )
    Amount: Union[Drops, IOUAmountObject, MPTAmountObject] = Field(
        description="Payment amount (XRP, IOU, or MPT)"
    )
    SendMax: Optional[Union[Drops, IOUAmountObject, MPTAmountObject]] = Field(
        default=None,
        description="Maximum to send (for path-finding)"
    )
    Paths: Optional[List[List[Dict[str, Any]]]] = Field(
        default=None,
        max_length=1000,
        description="Payment paths for non-direct transfers"
    )
    
    @field_validator("Amount", "SendMax", mode="before")
    @classmethod
    def validate_amount(cls, v):
        """Validate amount format."""
        if isinstance(v, str):
            if not v.isdigit():
                raise ValueError("XRP amount must be numeric string")
            if len(v) > 18:
                raise ValueError("Amount exceeds maximum")
            return v
        elif isinstance(v, dict):
            if "mpt_issuance_id" in v:
                if "amount" not in v:
                    raise ValueError("MPT requires 'amount' field")
            elif "currency" in v and "issuer" in v:
                if "value" not in v:
                    raise ValueError("IOU requires 'currency', 'issuer', 'value'")
            return v
        return v


class TrustSet(TransactionBase):
    """TrustSet transaction to establish trustlines."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["TrustSet"]
    LimitAmount: LimitAmountObject = Field(description="Trustline limit amount")
    QualityIn: Optional[conint(ge=0)] = Field(default=None)
    QualityOut: Optional[conint(ge=0)] = Field(default=None)


class SignIn(BaseModel):
    """SignIn transaction (authentication, minimal validation)."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["SignIn"]
    Account: Optional[XRPLAddress] = Field(
        default=None,
        description="Optional account for sign-in"
    )


class AccountSet(TransactionBase):
    """AccountSet transaction to modify account properties (like enabling escrows)."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["AccountSet"]
    SetFlag: Optional[conint(ge=0)] = Field(default=None, description="Integer flag to enable")
    ClearFlag: Optional[conint(ge=0)] = Field(default=None, description="Integer flag to disable")
    Domain: Optional[str] = Field(default=None, description="Hex-encoded lowercase string")
    EmailHash: Optional[str] = Field(default=None, description="128-bit MD5 hash")
    MessageKey: Optional[str] = Field(default=None, description="Public key")
    TransferRate: Optional[conint(ge=0)] = Field(default=None, description="Transfer fee rate")
    TickSize: Optional[conint(ge=0, le=15)] = Field(default=None, description="Tick size for offers")


class BatchTransaction(BaseModel):
    """Inner transaction within a Batch."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    Transaction: Union[EscrowCreate, EscrowFinish, EscrowCancel, Payment, TrustSet, AccountSet] = Field(
        description="Inner transaction"
    )


AnyInnerTransaction = Union[
    EscrowCreate,
    EscrowFinish,
    EscrowCancel,
    Payment,
    TrustSet,
    AccountSet,
    BatchTransaction,
    Dict[str, Any]
]


class Batch(TransactionBase):
    """Batch transaction containing up to 8 inner transactions."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Literal["Batch"]
    Transactions: Annotated[
        List[AnyInnerTransaction],
        Field(
            min_length=1,
            max_length=8,
            description="1-8 inner transactions"
        )
    ] = Field(description="Inner transactions (max 8)")


AnyXRPLTransaction = Union[
    EscrowCreate,
    EscrowFinish,
    EscrowCancel,
    Payment,
    TrustSet,
    AccountSet,
    Batch,
    SignIn,
    Dict[str, Any]
]


# ============================================================================
# REQUEST MODELS FOR ENDPOINTS
# ============================================================================

class SubmitTxRequest(BaseModel):
    """Request to submit a signed transaction blob."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    tx_blob: TxBlob = Field(description="Hex-encoded signed transaction")


class SubmitJsonRequest(BaseModel):
    """Request to submit a transaction JSON."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    tx_json: AnyXRPLTransaction = Field(
        description="Transaction JSON to submit"
    )


class XRPLTransaction(BaseModel):
    """Generic transaction validator (supports all types)."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    TransactionType: Optional[str] = Field(
        default=None,
        description="Transaction type"
    )
    Transactions: Optional[
        Annotated[
            List[AnyInnerTransaction],
            Field(min_length=1, max_length=8)
        ]
    ] = Field(
        default=None,
        description="Inner transactions for Batch"
    )


class TemplateParams(BaseModel):
    """Parameters for template building."""
    model_config = ConfigDict(extra="allow", strict=False)
    
    # Allows dynamic template parameters without strict validation
    # Individual fields are validated by template processor


class XummPayloadRequest(BaseModel):
    """Request to create an Xaman payload."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    txjson: Optional[AnyXRPLTransaction] = Field(
        default=None,
        description="Transaction JSON for Xaman signature"
    )
    user_token: Optional[str] = Field(
        default=None,
        max_length=256,
        description="Xaman user token for push notifications"
    )
    custom_meta: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom metadata for Xaman"
    )
    # Also accept direct transaction fields
    TransactionType: Optional[str] = Field(
        default=None,
        description="Transaction type (if provided directly)"
    )
    Transactions: Optional[
        Annotated[
            List[AnyInnerTransaction],
            Field(min_length=1, max_length=8)
        ]
    ] = Field(
        default=None,
        description="Inner transactions"
    )


class PayloadStatusQuery(BaseModel):
    """Query for payload status."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    uuid: PayloadUUID = Field(description="Xaman payload UUID")


class IssuanceStatusQuery(BaseModel):
    """Query for issuer account status."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    account: XRPLAddress = Field(description="Account to check")


class TrustlineQuery(BaseModel):
    """Query for trustline status."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    destination: XRPLAddress = Field(description="Destination account")
    issuer: XRPLAddress = Field(description="Token issuer")
    currency: CurrencyCode = Field(description="Currency code")


class EscrowQuery(BaseModel):
    """Query for active escrows."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    account: XRPLAddress = Field(description="Account to query")


class FeeEstimateRequest(BaseModel):
    """Request to estimate transaction fee."""
    model_config = ConfigDict(extra="forbid", strict=True)
    
    tx: AnyXRPLTransaction = Field(
        description="Transaction for fee estimation"
    )
