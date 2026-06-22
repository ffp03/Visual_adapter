from huggingface_hub import HfApi

api = HfApi(token="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")
repo_id = "ffpffp/visual-adapter-backend"

print(f"Fetching logs for {repo_id}...")
try:
    # Try to get runtime info which often contains recent logs
    runtime = api.get_space_runtime(repo_id=repo_id)
    print(f"Stage: {runtime.stage}")
    print(f"Hardware: {runtime.hardware}")
    
    # Note: get_space_logs might not be available in all versions, 
    # but let's try to access logs if they are in the runtime object
    # or try the method if it exists
    if hasattr(api, 'get_space_logs'):
        logs = api.get_space_logs(repo_id=repo_id)
        print("--- LOGS ---")
        print(logs)
    else:
        print("get_space_logs method not found. Printing runtime info:")
        print(runtime)

except Exception as e:
    print(f"Error: {e}")
