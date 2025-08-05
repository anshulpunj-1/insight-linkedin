import cv2
import pytesseract
import sys
import os
import sys, os
from PIL import Image

def preprocess_image(image_path):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load image: {image_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return gray

def extract_text_from_image(image_path):
    preprocessed = preprocess_image(image_path)
    text = pytesseract.image_to_string(preprocessed)
    return text

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python ocr_helper.py <image_path>")
        sys.exit(1)

    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"❌ Image not found: {path}")
        sys.exit(1)

    try:
        text = extract_text_from_image(path)
        with open(path + '.txt', 'w') as f:
            f.write(text)
        print(f"✅ OCR done for {path}")
    except Exception as e:
        print(f"❌ OCR failed for {path}: {e}")
        sys.exit(1)

        path = sys.argv[1]
if not os.path.exists(path):
    print("OCR ERROR: file does not exist.")
    sys.exit(1)

try:
    img = Image.open(path)
    img.verify()  # Check if it's a valid image
except Exception as e:
    print("OCR ERROR: Could not load image:", e)
    sys.exit(1)