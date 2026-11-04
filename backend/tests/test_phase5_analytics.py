import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.security import HTTPAuthorizationCredentials
from app.api.v1.endpoints.forms import (
    get_form_responses_summary,
    get_form_responses,
    delete_single_response,
    delete_all_responses,
    toggle_form_accepting,
    export_form_csv,
)
from app.core.security import get_current_user, security_scheme


def run_tests():
    print("Starting Phase 5 Response Analytics & Management Tests...", flush=True)

    mock_user = {"id": "11111111-1111-1111-1111-111111111111", "email": "creator@test.com"}
    mock_creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_token")

    mock_questions = [
        {
            "id": "q1",
            "field_key": "q_choice",
            "question_type": "multiple_choice",
            "label": "Favorite Track",
            "options": [{"label": "Web", "value": "web"}, {"label": "AI", "value": "ai"}],
            "order_index": 0,
        },
        {
            "id": "q2",
            "field_key": "q_rating",
            "question_type": "linear_scale",
            "label": "Satisfaction Rating",
            "options": [],
            "order_index": 1,
        },
    ]

    mock_responses = [
        {
            "id": "r1",
            "sap_id": "alice",
            "submitted_at": "2026-11-04T10:00:00Z",
            "completion_time_seconds": 45,
        },
        {
            "id": "r2",
            "sap_id": "bob",
            "submitted_at": "2026-11-04T11:00:00Z",
            "completion_time_seconds": 65,
        },
    ]

    mock_answers = [
        {"response_id": "r1", "question_id": "q1", "answer_value": "Web"},
        {"response_id": "r1", "question_id": "q2", "answer_value": 5},
        {"response_id": "r2", "question_id": "q1", "answer_value": "AI"},
        {"response_id": "r2", "question_id": "q2", "answer_value": 4},
    ]

    # 1. Test Analytical Summary Endpoint
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            # Form check
            [{"id": "f1", "title": "Test Survey", "status": "published", "response_count": 2}],
            # Questions
            mock_questions,
            # Responses
            mock_responses,
            # Answers
            mock_answers,
        ]

        summary = asyncio.run(get_form_responses_summary("f1", mock_user, mock_creds))
        assert summary["success"] is True
        assert summary["total_responses"] == 2
        assert summary["average_completion_time_seconds"] == 55.0  # (45 + 65) / 2
        assert len(summary["question_summaries"]) == 2

        # Check choice distribution
        choice_summary = summary["question_summaries"][0]
        assert choice_summary["question_id"] == "q1"
        assert len(choice_summary["options_distribution"]) == 2

        # Check rating scale distribution & average
        rating_summary = summary["question_summaries"][1]
        assert rating_summary["rating_stats"]["average"] == 4.5  # (5 + 4) / 2
        print("[PASS] GET /forms/{id}/responses/summary calculates accurate aggregates and distributions", flush=True)

    # 2. Test Get Form Responses List
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{"id": "f1", "title": "Test Survey", "status": "published", "response_count": 2}],
            mock_responses,
            mock_questions,
            mock_answers,
        ]

        res = asyncio.run(get_form_responses("f1", mock_user, mock_creds))
        assert res["success"] is True
        assert len(res["responses"]) == 2
        assert len(res["responses"][0]["answers"]) == 2
        print("[PASS] GET /forms/{id}/responses returns submissions with answers attached", flush=True)

    # 3. Test Toggle Accepting Responses Status
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{"id": "f1", "status": "published"}],
            [],  # PATCH status to closed
        ]

        toggle_res = asyncio.run(toggle_form_accepting("f1", mock_user, mock_creds))
        assert toggle_res["status"] == "closed"
        print("[PASS] PATCH /forms/{id}/toggle-status toggles form accepting state", flush=True)

    # 4. Test Delete Single Response
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{"id": "f1", "response_count": 5}],
            [],  # DELETE response
            [],  # PATCH response_count to 4
        ]

        del_res = asyncio.run(delete_single_response("f1", "r1", mock_user, mock_creds))
        assert del_res["success"] is True
        print("[PASS] DELETE /forms/{id}/responses/{response_id} decrements count and deletes record", flush=True)

    # 5. Test Delete All Responses
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{"id": "f1", "response_count": 5}],
            [],  # DELETE all responses
            [],  # PATCH response_count to 0
        ]

        del_all_res = asyncio.run(delete_all_responses("f1", mock_user, mock_creds))
        assert del_all_res["success"] is True
        print("[PASS] DELETE /forms/{id}/responses resets all responses to 0", flush=True)

    # 6. Test CSV Export Streaming
    with patch("app.api.v1.endpoints.forms.get_supabase_response", new_callable=AsyncMock) as mock_sb:
        mock_sb.side_effect = [
            [{"id": "f1", "title": "Test Survey", "shareable_slug": "test_slug"}],
            mock_questions,
            mock_responses,
            mock_answers,
        ]

        csv_res = asyncio.run(export_form_csv("f1", mock_user, mock_creds))
        assert csv_res.media_type == "text/csv"
        assert "test_slug_responses.csv" in csv_res.headers["Content-Disposition"]
        print("[PASS] GET /forms/{id}/export/csv streams properly formatted CSV with attachment headers", flush=True)

    print("All Phase 5 backend tests completed successfully!", flush=True)


def test_phase5_analytics():
    run_tests()


if __name__ == "__main__":
    run_tests()

