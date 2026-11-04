import io
import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)
SLUG = "test_form_upload_slug"


# 1. Valid allowed files
def test_valid_pdf_upload():
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("document.pdf", pdf_content, "application/pdf")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["file_name"] == "document.pdf"


def test_valid_png_upload():
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("avatar.png", png_content, "image/png")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["file_name"] == "avatar.png"


def test_valid_jpeg_upload():
    jpeg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("photo.jpg", jpeg_content, "image/jpeg")},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_valid_webp_upload():
    webp_content = b"RIFF\x18\x00\x00\x00WEBPVP8 \x0c\x00\x00\x00/ \x00\x000\x00\x00\x00"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("banner.webp", webp_content, "image/webp")},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_valid_gif_upload():
    gif_content = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("anim.gif", gif_content, "image/gif")},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_valid_docx_and_xlsx_upload():
    # ZIP-based OOXML formats
    docx_content = b"PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("report.docx", docx_content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

    xlsx_content = b"PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("data.xlsx", xlsx_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_valid_txt_and_csv_upload():
    txt_content = b"This is a legitimate feedback response text file."
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("notes.txt", txt_content, "text/plain")},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

    csv_content = b"id,name,score\n1,Alice,95\n2,Bob,88\n"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("results.csv", csv_content, "text/csv")},
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


# 2. Blocked executable/script extensions
@pytest.mark.parametrize("bad_filename", [
    "payload.exe",
    "script.sh",
    "command.bat",
    "run.cmd",
    "webshell.php",
    "exploit.py",
    "index.html",
    "vector.svg",
    "app.jar",
    "library.dll",
])
def test_blocked_executable_extensions(bad_filename):
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": (bad_filename, b"print('hello')", "application/octet-stream")},
    )
    assert res.status_code == 400
    assert "not permitted" in res.json()["detail"].lower()


# 3. Disguised executable with allowed extension
def test_disguised_windows_pe_executable_as_png():
    # Windows PE header (MZ) disguised as .png
    fake_png = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("picture.png", fake_png, "image/png")},
    )
    assert res.status_code == 400
    assert "executable" in res.json()["detail"].lower() or "signature" in res.json()["detail"].lower()


def test_disguised_linux_elf_executable_as_pdf():
    # Linux ELF header disguised as .pdf
    fake_pdf = b"\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("statement.pdf", fake_pdf, "application/pdf")},
    )
    assert res.status_code == 400
    assert "executable" in res.json()["detail"].lower() or "signature" in res.json()["detail"].lower()


def test_disguised_shebang_script_as_txt():
    # Shell script with shebang disguised as .txt
    fake_txt = b"#!/bin/bash\nrm -rf /"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("readme.txt", fake_txt, "text/plain")},
    )
    assert res.status_code == 400
    assert "executable" in res.json()["detail"].lower()


# 4. HTML/JS-style payload disguised as allowed content
def test_disguised_html_script_payload_as_txt():
    xss_payload = b"<script>alert(document.cookie)</script>"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("notes.txt", xss_payload, "text/plain")},
    )
    assert res.status_code == 400
    assert "script" in res.json()["detail"].lower() or "not permitted" in res.json()["detail"].lower()


def test_disguised_svg_markup_as_png():
    svg_payload = b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("image.png", svg_payload, "image/png")},
    )
    assert res.status_code == 400


# 5. Existing 10 MB size limit behavior
def test_oversized_upload_rejected_with_413():
    # Valid PDF signature followed by bytes exceeding 10MB limit
    oversized = b"%PDF-1.4\n" + b"A" * (10 * 1024 * 1024 + 100)
    res = client.post(
        f"/api/v1/forms/public/{SLUG}/upload",
        files={"file": ("large.pdf", oversized, "application/pdf")},
    )
    assert res.status_code == 413
    assert "exceeds" in res.json()["detail"].lower()
