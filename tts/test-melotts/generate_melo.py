import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
MATERIAL = BASE / 'tts-materials-v1.json'
OUT = BASE / 'out'
OUT.mkdir(parents=True, exist_ok=True)

# NOTE: 需要先确保 MeloTTS 可 import。
# 典型调用（不同版本 API 可能略有差异）：
# from melo.api import TTS
# model = TTS(language='ZH', device='cpu')
# model.tts_to_file(text='你好', speaker_id=0, output_path='xx.mp3', speed=1.0)

def main():
    data = json.loads(MATERIAL.read_text())
    required = data.get('required', [])
    print(f"Will generate {len(required)} required clips into: {OUT}")
    for item in required:
        print(f"- {item['file']} :: {item['text']}")

    try:
        from melo.api import TTS  # type: ignore
    except Exception as e:
        print('\n[BLOCKED] MeloTTS import failed:', e)
        print('Please finish MeloTTS dependency install first (mecab/fugashi related).')
        return

    model = TTS(language='ZH', device='cpu')
    for item in required:
        out_path = OUT / item['file']
        model.tts_to_file(
            text=item['text'],
            speaker_id=0,
            output_path=str(out_path),
            speed=1.0,
        )
        print('[OK]', out_path)

if __name__ == '__main__':
    main()
