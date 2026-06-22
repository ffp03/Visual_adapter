from huggingface_hub import HfApi

print("Available methods in HfApi:")
methods = [m for m in dir(HfApi) if not m.startswith('_')]
for m in sorted(methods):
    if 'log' in m.lower() or 'space' in m.lower():
        print(f"- {m}")
