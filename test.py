import sys
sys.path.insert(0, 'e:/Project/contrac-ai')
from backend.app.auth import create_access_token
import urllib.request
import urllib.error

token = create_access_token({'sub': 'admin'})
req = urllib.request.Request('http://127.0.0.1:18920/api/contracts')
req.add_header('Authorization', f'Bearer {token}')
try:
    print(urllib.request.urlopen(req).read().decode())
except urllib.error.HTTPError as e:
    print(e.read().decode())
