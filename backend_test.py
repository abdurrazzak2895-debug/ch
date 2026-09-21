#!/usr/bin/env python3
"""
Backend test for T2Hub live proxy (svp-proxy edge function)
Testing the POST /booking-data/bootstrap endpoint with 5 variants
"""

import requests
import json
import time
from typing import Dict, Any, List

# Base URL and headers
BASE_URL = "https://xklwzkraobxetxdcysun.supabase.co/functions/v1/svp-proxy"
HEADERS = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbHd6a3Jhb2J4ZXR4ZGN5c3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU4NzU5NzcsImV4cCI6MjA0MTQ1MTk3N30.DmaCr-JGwROOx7VV8srFhQ_wtQfokBf",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbHd6a3Jhb2J4ZXR4ZGN5c3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU4NzU5NzcsImV4cCI6MjA0MTQ1MTk3N30.DmaCr-JGwROOx7VV8srFhQ_wtQfokBf",
    "Content-Type": "application/json"
}

def test_bootstrap_endpoint(test_name: str, body: Dict[str, Any], expected_keys: List[str], 
                           retry_count: int = 1, retry_delay: float = 2.0) -> Dict[str, Any]:
    """
    Test the bootstrap endpoint with given body
    
    Args:
        test_name: Name of the test
        body: JSON body to send
        expected_keys: Keys expected in response
        retry_count: Number of retries for intermittent failures
        retry_delay: Delay between retries in seconds
    
    Returns:
        Dict with test results
    """
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")
    print(f"Body: {json.dumps(body, indent=2)}")
    
    url = f"{BASE_URL}/booking-data/bootstrap"
    attempts = 0
    last_error = None
    
    for attempt in range(1, retry_count + 1):
        attempts = attempt
        try:
            print(f"\nAttempt {attempt}/{retry_count}...")
            response = requests.post(url, json=body, headers=HEADERS, timeout=60)
            
            print(f"HTTP Status: {response.status_code}")
            
            # Try to parse JSON response
            try:
                data = response.json()
            except json.JSONDecodeError:
                print(f"Response (text): {response.text[:500]}")
                last_error = "Invalid JSON response"
                if attempt < retry_count:
                    time.sleep(retry_delay)
                    continue
                return {
                    "test_name": test_name,
                    "status": "FAIL",
                    "http_status": response.status_code,
                    "error": "Invalid JSON response",
                    "attempts": attempts
                }
            
            # Check for abort error (code 20)
            if isinstance(data, dict) and data.get("code") == 20:
                print(f"⚠ Abort error detected: {data.get('message', 'Unknown')}")
                last_error = f"Abort error: {data.get('message')}"
                if attempt < retry_count:
                    time.sleep(retry_delay)
                    continue
                return {
                    "test_name": test_name,
                    "status": "FAIL",
                    "http_status": response.status_code,
                    "error": last_error,
                    "attempts": attempts,
                    "data": data
                }
            
            # Check HTTP status
            if response.status_code != 200:
                print(f"Response: {json.dumps(data, indent=2)[:500]}")
                return {
                    "test_name": test_name,
                    "status": "FAIL",
                    "http_status": response.status_code,
                    "error": f"Expected HTTP 200, got {response.status_code}",
                    "attempts": attempts,
                    "data": data
                }
            
            # Check expected keys
            missing_keys = [key for key in expected_keys if key not in data]
            if missing_keys:
                print(f"Response keys: {list(data.keys())}")
                print(f"Missing keys: {missing_keys}")
                return {
                    "test_name": test_name,
                    "status": "FAIL",
                    "http_status": response.status_code,
                    "error": f"Missing expected keys: {missing_keys}",
                    "attempts": attempts,
                    "data": data
                }
            
            # Print response excerpt
            print(f"\n✅ SUCCESS (after {attempts} attempt(s))")
            print(f"Response keys: {list(data.keys())}")
            
            # Print specific data based on expected keys
            for key in expected_keys:
                value = data.get(key)
                if isinstance(value, list):
                    print(f"  {key}: [{len(value)} items]")
                    if len(value) > 0:
                        print(f"    First item: {json.dumps(value[0], indent=6)[:300]}")
                else:
                    print(f"  {key}: {value}")
            
            return {
                "test_name": test_name,
                "status": "PASS",
                "http_status": response.status_code,
                "attempts": attempts,
                "data": data
            }
            
        except requests.exceptions.Timeout:
            print(f"⚠ Request timeout (60s)")
            last_error = "Request timeout"
            if attempt < retry_count:
                time.sleep(retry_delay)
                continue
        except requests.exceptions.RequestException as e:
            print(f"⚠ Request error: {e}")
            last_error = str(e)
            if attempt < retry_count:
                time.sleep(retry_delay)
                continue
    
    # All retries failed
    return {
        "test_name": test_name,
        "status": "FAIL",
        "http_status": None,
        "error": last_error or "All retries failed",
        "attempts": attempts
    }


def main():
    """Run all bootstrap endpoint tests"""
    print("\n" + "="*80)
    print("T2Hub Live Proxy - Bootstrap Endpoint Verification")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Endpoint: POST /booking-data/bootstrap")
    
    results = []
    
    # Test 1: Empty body → occupations
    result1 = test_bootstrap_endpoint(
        test_name="Test 1: Occupations catalog (empty body)",
        body={},
        expected_keys=["occupations"]
    )
    results.append(result1)
    
    # Verify occupation_id field presence
    if result1["status"] == "PASS":
        occupations = result1["data"].get("occupations", [])
        if occupations:
            first_occ = occupations[0]
            has_id = "id" in first_occ
            has_occupation_id = "occupation_id" in first_occ
            has_english_name = "english_name" in first_occ
            
            print(f"\n  🔍 Occupation field verification:")
            print(f"    - 'id' field present: {has_id}")
            print(f"    - 'occupation_id' field present: {has_occupation_id}")
            print(f"    - 'english_name' field present: {has_english_name}")
            
            if has_id and has_occupation_id and has_english_name:
                print(f"    ✅ All required fields present (T2Hub PACC catalog restored)")
            else:
                print(f"    ❌ Missing required fields")
                result1["status"] = "FAIL"
                result1["error"] = "Missing required occupation fields (id, occupation_id, or english_name)"
    
    # Test 2: Available dates
    result2 = test_bootstrap_endpoint(
        test_name="Test 2: Available dates (category_id=50, city=Dhaka)",
        body={"category_id": "50", "city": "Dhaka"},
        expected_keys=["available_dates"]
    )
    results.append(result2)
    
    # Verify non-empty dates
    if result2["status"] == "PASS":
        dates = result2["data"].get("available_dates", [])
        if not dates:
            print(f"  ❌ available_dates is EMPTY (expected non-empty)")
            result2["status"] = "FAIL"
            result2["error"] = "available_dates array is empty"
        else:
            print(f"  ✅ available_dates is non-empty: {dates[:3]}")
    
    # Test 3: Sessions (with retry for intermittent abort)
    result3 = test_bootstrap_endpoint(
        test_name="Test 3: Sessions (category_id=50, city=Dhaka, exam_date=2026-09-27)",
        body={"category_id": "50", "city": "Dhaka", "exam_date": "2026-09-27"},
        expected_keys=["sessions", "sites"],
        retry_count=4,
        retry_delay=2.0
    )
    results.append(result3)
    
    # Verify non-empty sessions
    if result3["status"] == "PASS":
        sessions = result3["data"].get("sessions", [])
        sites = result3["data"].get("sites", [])
        if not sessions:
            print(f"  ❌ sessions is EMPTY (expected non-empty)")
            result3["status"] = "FAIL"
            result3["error"] = "sessions array is empty"
        else:
            print(f"  ✅ sessions is non-empty: {len(sessions)} session(s)")
            if sessions:
                first_session = sessions[0]
                print(f"    First session keys: {list(first_session.keys())}")
                # Check for center name
                center_name = (first_session.get("test_center", {}).get("test_center_name") or 
                              first_session.get("center_name") or 
                              first_session.get("test_center_name"))
                available_seats = first_session.get("available_seats")
                print(f"    Center name: {center_name}")
                print(f"    Available seats: {available_seats}")
        
        if not sites:
            print(f"  ⚠ sites is EMPTY (expected non-empty)")
        else:
            print(f"  ✅ sites is non-empty: {len(sites)} site(s)")
    
    # Test 4: Centers
    result4 = test_bootstrap_endpoint(
        test_name="Test 4: Test centers (resource=centers, city=Dhaka)",
        body={"resource": "centers", "city": "Dhaka"},
        expected_keys=["sites"]
    )
    results.append(result4)
    
    # Verify non-empty sites
    if result4["status"] == "PASS":
        sites = result4["data"].get("sites", [])
        if not sites:
            print(f"  ❌ sites is EMPTY (expected non-empty)")
            result4["status"] = "FAIL"
            result4["error"] = "sites array is empty"
        else:
            print(f"  ✅ sites is non-empty: {len(sites)} site(s)")
    
    # Test 5: Negative test (SVP occupation id)
    result5 = test_bootstrap_endpoint(
        test_name="Test 5: Negative test (SVP occupation_id=2492, should return empty)",
        body={"category_id": "2492", "city": "Dhaka"},
        expected_keys=["available_dates"]
    )
    results.append(result5)
    
    # Verify EMPTY dates (this is the expected behavior)
    if result5["status"] == "PASS":
        dates = result5["data"].get("available_dates", [])
        if dates:
            print(f"  ❌ available_dates is NON-EMPTY (expected empty for SVP id)")
            result5["status"] = "FAIL"
            result5["error"] = "available_dates should be empty for SVP occupation_id"
        else:
            print(f"  ✅ available_dates is EMPTY (correct - SVP id-space not accepted)")
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    for result in results:
        status_icon = "✅" if result["status"] == "PASS" else "❌"
        print(f"{status_icon} {result['test_name']}: {result['status']}")
        if result["status"] == "FAIL":
            print(f"   Error: {result.get('error', 'Unknown error')}")
        if "attempts" in result and result["attempts"] > 1:
            print(f"   (Took {result['attempts']} attempts)")
    
    # Overall result
    passed = sum(1 for r in results if r["status"] == "PASS")
    total = len(results)
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(main())
