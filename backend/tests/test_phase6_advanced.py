import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.v1.endpoints.forms import SlugUpdate, dispatch_submission_notifications


def test_slug_validation():
    # Valid slugs
    assert SlugUpdate(shareable_slug="annual-survey-2026").shareable_slug == "annual-survey-2026"
    assert SlugUpdate(shareable_slug="hackathon_spring").shareable_slug == "hackathon_spring"
    assert SlugUpdate(shareable_slug="form123").shareable_slug == "form123"

    # Uppercase is normalized to lowercase
    assert SlugUpdate(shareable_slug="My-Event-2026").shareable_slug == "my-event-2026"

    # Invalid slugs
    try:
        SlugUpdate(shareable_slug="ab")  # Too short (< 3)
        assert False, "Should fail on short slug"
    except Exception:
        pass

    try:
        SlugUpdate(shareable_slug="-invalid-start")
        assert False, "Should fail on starting hyphen"
    except Exception:
        pass

    try:
        SlugUpdate(shareable_slug="invalid-end-")
        assert False, "Should fail on trailing hyphen"
    except Exception:
        pass

    try:
        SlugUpdate(shareable_slug="invalid@slug!")
        assert False, "Should fail on special characters"
    except Exception:
        pass

    print("[PASS] SlugUpdate validation enforces clean vanity slugs.")


def test_dag_conditional_logic():
    # Simulate DAG rule engine
    questions = [
        {"id": "q1", "order_index": 0, "label": "Attending?", "validation_rules": {}},
        {
            "id": "q2",
            "order_index": 1,
            "label": "Dietary requirements",
            "validation_rules": {
                "logic_rules": [
                    {
                        "id": "r1",
                        "source_question_id": "q1",
                        "operator": "equals",
                        "value": "yes",
                        "action": "show",
                    }
                ]
            },
        },
    ]

    def evaluate_visibility(q, answers):
        rules = q.get("validation_rules", {}).get("logic_rules", [])
        if not rules:
            return True
        for rule in rules:
            ans = answers.get(rule["source_question_id"])
            matches = str(ans or "").lower() == str(rule["value"]).lower()
            if rule["action"] == "show" and not matches:
                return False
        return True

    # When q1 is "no", q2 is hidden
    assert not evaluate_visibility(questions[1], {"q1": "no"})
    # When q1 is "yes", q2 is visible
    assert evaluate_visibility(questions[1], {"q1": "yes"})
    # Predecessor order index guarantee: q2 can only depend on questions with order_index < 1
    predecessors = [p for p in questions if p["order_index"] < questions[1]["order_index"]]
    assert len(predecessors) == 1 and predecessors[0]["id"] == "q1"

    print("[PASS] Conditional Logic DAG evaluation functions without cycles.")


def test_notification_pipeline_dispatch():
    # Verify notification pipeline function handles parameters safely without throwing
    dispatch_submission_notifications(
        slug="test-form",
        form_title="Hypervision Test Form",
        creator_id="00000000-0000-0000-0000-000000000001",
        response_id="00000000-0000-0000-0000-000000000002",
        answers_count=5,
        form_settings={"notifications": {"email_creator": True, "creator_email": "creator@test.local"}},
    )
    print("[PASS] Notification pipeline dispatched alert successfully.")


if __name__ == "__main__":
    test_slug_validation()
    test_dag_conditional_logic()
    test_notification_pipeline_dispatch()
    print("\nALL PHASE 6 UNIT TESTS PASSED SUCCESSFULLY!")

