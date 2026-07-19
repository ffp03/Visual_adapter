import requests
import re
import os

# HF token loaded from env (dotfiles-ai -> ~/.env.shared); was hardcoded, moved 2026-07-19.
# See ~/dotfiles-ai/docs/secret-scrub-2026-07-19.md
TOKEN = os.environ["HF_TOKEN"]
URL = "https://huggingface.co/spaces/ffpffp/visual-adapter-backend"

# Try using token as cookie
cookies = {"token": TOKEN}
response = requests.get(URL, cookies=cookies)

if response.status_code == 200:
    print("Successfully fetched page")
    # Look for the embedded config that contains the log URL or build ID
    # This is usually in a script tag or data attribute
    print(response.text[:2000]) # Print first 2000 chars to check structure
else:
    print(f"Failed to fetch page: {response.status_code}")
