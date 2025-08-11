# tools/translate.py
import os, json, time, urllib.parse, urllib.request, sys

DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY")
API_URL = "https://api-free.deepl.com/v2/translate"

SRC = "issues.ko.json"
TARGET_LANGS = ["en", "ja"]          # 필요하면 추가: "de", "fr" 등
FIELDS = ["title", "summary", "details"]
TRANSLATE_TAGS = True                # 태그도 번역할지

def deepl(text, target):
    if not text:
        return text
    data = urllib.parse.urlencode({
        "auth_key": DEEPL_API_KEY,
        "text": text,
        "target_lang": target.upper(),   # "EN", "JA" 등
    }).encode("utf-8")
    req = urllib.request.Request(API_URL, data=data)
    with urllib.request.urlopen(req) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
        return payload["translations"][0]["text"]

def main():
    if not DEEPL_API_KEY:
        print("Missing DEEPL_API_KEY", file=sys.stderr)
        sys.exit(1)

    with open(SRC, "r", encoding="utf-8") as f:
        items = json.load(f)

    for lang in TARGET_LANGS:
        out = []
        for item in items:
            new_item = dict(item)
            for field in FIELDS:
                if field in new_item and isinstance(new_item[field], str):
                    new_item[field] = deepl(new_item[field], lang)
                    time.sleep(0.2)  # rate limit 여유
            if TRANSLATE_TAGS and isinstance(new_item.get("tags"), list):
                new_item["tags"] = [deepl(t, lang) for t in new_item["tags"]]
                time.sleep(0.2)
            out.append(new_item)

        with open(f"issues.{lang}.json", "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)

    print("Done:", [f"issues.{l}.json" for l in TARGET_LANGS])

if __name__ == "__main__":
    main()
