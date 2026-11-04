import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException
from app.api.v1.endpoints.forms import (
    PublicSubmission,
    PublicAnswer,
    submit_public_response,
    submission_rate_limiter,
)


def run_rate_limit_tests():
    print("Starting Phase 7 Rate Limiting Tests on /submit...", flush=True)

    # Clean state
    submission_rate_limiter.reset()

    mock_form = [{
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "Rate Limit Test Form",
        "status": "published",
        "settings": {"allow_multiple_responses": True},
        "response_count": 0,
    }]
    mock_questions = [{
        "id": "22222222-2222-2222-2222-222222222222",
        "field_key": "q1",
        "question_type": "short_text",
        "label": "Name",
        "is_required": False,
        "order_index": 0,
        "options": [],
        "validation_rules": {},
    }]

    submission = PublicSubmission(
        respondent_identifier="tester",
        answers=[
            PublicAnswer(
                question_id="22222222-2222-2222-2222-222222222222",
                answer_value="Test Value",
            )
        ],
    )

    # 1. Test requests up to burst limit (10) succeed from IP 192.168.1.100
    mock_req_a = MagicMock()
    mock_req_a.client.host = "192.168.1.100"
    mock_req_a.headers = {}

    side_effects = []
    for i in range(10):
        side_effects.extend([mock_form, mock_questions, [{"id": f"resp-{i}"}], [], []])

    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = side_effects

        for i in range(10):
            res = asyncio.run(submit_public_response("test-form", submission, mock_req_a))
            assert res["success"] is True, f"Request {i+1} should succeed within limit"
        print("[PASS] 10 consecutive requests within burst capacity accepted (200 OK)", flush=True)

    # 2. Test 11th request from same IP is throttled with 429 Too Many Requests
    try:
        asyncio.run(submit_public_response("test-form", submission, mock_req_a))
        assert False, "11th request should have raised HTTPException 429"
    except HTTPException as e:
        assert e.status_code == 429, f"Expected 429, got {e.status_code}"
        assert "Retry-After" in e.headers, "Response must include Retry-After header"
        assert int(e.headers["Retry-After"]) >= 1, "Retry-After must be positive"
        print(f"[PASS] 11th rapid request throttled with 429 Too Many Requests (Retry-After: {e.headers['Retry-After']}s)", flush=True)

    # 3. Test request from a different IP (192.168.1.200) is NOT blocked (IP-based isolation)
    mock_req_b = MagicMock()
    mock_req_b.client.host = "192.168.1.200"
    mock_req_b.headers = {}

    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            mock_form, mock_questions, [{"id": "resp-b-1"}], [], []
        ]
        res_b = asyncio.run(submit_public_response("test-form", submission, mock_req_b))
        assert res_b["success"] is True, "Request from different IP should be accepted"
        print("[PASS] Request from different IP address accepted without throttle (IP isolation verified)", flush=True)

    # 4. Test rate limiter reset restores capacity
    submission_rate_limiter.reset()
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            mock_form, mock_questions, [{"id": "resp-after-reset"}], [], []
        ]
        res_reset = asyncio.run(submit_public_response("test-form", submission, mock_req_a))
        assert res_reset["success"] is True
        print("[PASS] Rate limiter reset successfully restored token capacity", flush=True)

    print("\nALL PHASE 7 RATE LIMITING TESTS PASSED SUCCESSFULLY!", flush=True)


if __name__ == "__main__":
    run_rate_limit_tests()
