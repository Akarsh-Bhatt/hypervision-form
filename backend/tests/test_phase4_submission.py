import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import HTTPException
from app.api.v1.endpoints.forms import (
    PublicSubmission,
    PublicAnswer,
    get_public_form,
    submit_public_response,
)


def run_tests():
    print("Starting Phase 4 Submission & Public Viewer Tests...", flush=True)

    # 1. Test invalid slug rejection
    try:
        asyncio.run(get_public_form("invalid slug with spaces!"))
        assert False, "Should have raised HTTPException 400"
    except HTTPException as e:
        assert e.status_code == 400
        print("[PASS] Invalid slug rejected with 400", flush=True)

    # 2. Test non-existent form returns 404
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.return_value = []
        try:
            asyncio.run(get_public_form("nonexistent_form"))
            assert False, "Should have raised HTTPException 404"
        except HTTPException as e:
            assert e.status_code == 404
            print("[PASS] Non-existent slug returns 404", flush=True)

    # 3. Test closed form lifecycle gating
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{
                "id": "11111111-1111-1111-1111-111111111111",
                "title": "Closed Survey",
                "description": "Survey is closed",
                "status": "closed",
                "settings": {},
                "theme": {},
                "shareable_slug": "closed_survey",
                "response_count": 5,
            }],
            []  # questions
        ]
        res = asyncio.run(get_public_form("closed_survey"))
        assert res["lifecycle"]["is_open"] is False
        assert res["lifecycle"]["reason"] == "closed"
        print("[PASS] Closed form lifecycle correctly reported as closed", flush=True)

    # 4. Test published form returns open lifecycle and questions
    mock_questions = [
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "field_key": "q_name",
            "question_type": "short_text",
            "label": "Full Name",
            "is_required": True,
            "order_index": 0,
            "validation_rules": {},
            "options": []
        },
        {
            "id": "33333333-3333-3333-3333-333333333333",
            "field_key": "q_feedback",
            "question_type": "long_text",
            "label": "Feedback",
            "is_required": False,
            "order_index": 1,
            "validation_rules": {},
            "options": []
        }
    ]
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{
                "id": "11111111-1111-1111-1111-111111111111",
                "title": "Annual Feedback",
                "description": "Please give your feedback",
                "status": "published",
                "settings": {"confirmation_message": "Thanks!"},
                "theme": {},
                "shareable_slug": "annual_feedback",
                "response_count": 0,
            }],
            mock_questions
        ]
        res = asyncio.run(get_public_form("annual_feedback"))
        assert res["lifecycle"]["is_open"] is True
        assert len(res["questions"]) == 2
        print("[PASS] Published form returns 200 with open lifecycle and questions", flush=True)

    # 5. Test submission fails if required question is missing
    mock_req = MagicMock()
    mock_req.client.host = "127.0.0.1"

    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{
                "id": "11111111-1111-1111-1111-111111111111",
                "title": "Annual Feedback",
                "status": "published",
                "settings": {},
                "response_count": 0,
            }],
            mock_questions
        ]
        sub = PublicSubmission(
            respondent_identifier="john_doe",
            answers=[
                PublicAnswer(
                    question_id="33333333-3333-3333-3333-333333333333",
                    answer_value="Some feedback"
                )
            ]
        )
        try:
            asyncio.run(submit_public_response("annual_feedback", sub, mock_req))
            assert False, "Should have raised HTTPException 422"
        except HTTPException as e:
            assert e.status_code == 422
            assert "required" in str(e.detail).lower()
            print("[PASS] Submission enforces required questions on server (422)", flush=True)

    # 6. Test submission succeeds with valid answers
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            # 1. Fetch form
            [{
                "id": "11111111-1111-1111-1111-111111111111",
                "title": "Annual Feedback",
                "status": "published",
                "settings": {
                    "confirmation_message": "Thank you for your feedback!",
                    "allow_multiple_responses": True,
                },
                "response_count": 10,
            }],
            # 2. Fetch questions
            mock_questions,
            # 3. Insert response
            [{"id": "resp-uuid-123"}],
            # 4. Insert answers
            [],
            # 5. Increment counter
            []
        ]
        sub = PublicSubmission(
            respondent_identifier="john_doe",
            answers=[
                PublicAnswer(
                    question_id="22222222-2222-2222-2222-222222222222",
                    answer_value="John Doe"
                ),
                PublicAnswer(
                    question_id="33333333-3333-3333-3333-333333333333",
                    answer_value="Great system"
                )
            ]
        )
        res = asyncio.run(submit_public_response("annual_feedback", sub, mock_req))
        assert res["success"] is True
        assert res["response_id"] == "resp-uuid-123"
        assert res["message"] == "Thank you for your feedback!"
        print("[PASS] Valid submission succeeds, returns receipt and confirmation message", flush=True)

    print("All Phase 4 backend unit tests passed successfully!", flush=True)


if __name__ == "__main__":
    run_tests()
