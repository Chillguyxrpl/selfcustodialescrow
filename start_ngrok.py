import shutil
import subprocess
import time
import requests
import sys
import os

def find_ngrok():
    return shutil.which('ngrok')

def start_ngrok(port='8000'):
    ngrok = find_ngrok()
    if not ngrok:
        print('ngrok not found in PATH. Install ngrok from https://ngrok.com/')
        return None

    # Start ngrok in background
    proc = subprocess.Popen([ngrok, 'http', port], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('Started ngrok (pid=%s), waiting for tunnel...' % proc.pid)

    # Wait for local API to appear
    url = 'http://127.0.0.1:4040/api/tunnels'
    for _ in range(30):
        try:
            r = requests.get(url, timeout=2)
            if r.status_code == 200:
                data = r.json()
                for t in data.get('tunnels', []):
                    if t.get('proto') == 'https':
                        public = t.get('public_url')
                        print('Public URL:', public)
                        try:
                            import pyperclip
                            pyperclip.copy(public)
                            print('(Copied to clipboard)')
                        except Exception:
                            pass
                        return public
        except Exception:
            pass
        time.sleep(1)

    print('Timed out waiting for ngrok tunnels. Check ngrok process and the local web UI at http://127.0.0.1:4040')
    return None

if __name__ == '__main__':
    port = os.environ.get('PORT', '8000')
    public = start_ngrok(port)
    if public:
        print('\nTo configure XUMM webhook, set XUMM_WEBHOOK_URL to:')
        print(public + '/xumm/webhook')
    else:
        sys.exit(1)
