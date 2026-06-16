import codecs
import re

with open('src/components/DashboardPanel.tsx', 'rb') as f:
    data = f.read()

# Try to decode from 'gbk' or 'mbcs'
try:
    text = data.decode('mbcs')
except Exception:
    try:
        text = data.decode('utf-8')
    except Exception:
        text = data.decode('utf-8', errors='replace')

text = re.sub(r'<div style=\{\{\s*color:\s*\'var\(--neon-cyan\)\',\s*fontSize:\s*14,\s*fontWeight:\s*500\s*\}\}>\s*💡 \{simulationData\.advice\}\s*</div>', '', text)
text = re.sub(r'<div style=\{\{\s*color:\s*\'rgba\(255,255,255,0\.85\)\',\s*fontSize:\s*14,\s*lineHeight:\s*\'1\.6\'\s*\}\}>\s*💡 \{simulationData\.advice\}\s*</div>', '', text)

with open('src/components/DashboardPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
