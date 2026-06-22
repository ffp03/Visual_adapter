# Test Data for Rule Verification System

This directory contains test datasets for validating the performance and accuracy of the rule verification system.

## Files

### 1. `good_rules.json`
**Purpose**: Test cases with well-designed CSS selector rules that should pass verification.

**Contents**: 10 test cases covering:
- Semantic HTML5 selectors (`main`, `article`)
- Specific ID selectors (`#content`, `#zg-center-column`)
- Class-based selectors (`.search-results`)
- Multiple fallback selectors
- Proper exclusion lists

**Expected Results**:
- ✅ Verification status: `verified`
- ✅ Confidence: ≥70-80%
- ✅ Attempts: ≤2

---

### 2. `bad_rules.json`
**Purpose**: Test cases with poorly-designed rules that should fail verification.

**Contents**: 10 test cases covering common mistakes:
- Overly broad selectors (`body`, `div`)
- Wrong selectors (sidebar, header, footer as main content)
- Missing critical exclusions
- Non-existent selectors
- Overly specific selectors (`:nth-child(1)`)

**Expected Results**:
- ❌ Verification status: `failed`
- ❌ Confidence: ≤40-60%
- ❌ Should trigger refinement

---

### 3. `refinement_cases.json`
**Purpose**: Test cases that start with poor rules but should improve through refinement.

**Contents**: 10 test cases covering refinement scenarios:
- Narrowing scope (body → main)
- Adding missing exclusions
- Correcting wrong selectors
- Broadening overly specific selectors
- Finding valid selectors when initial one fails

**Expected Results**:
- ✅ Final status: `verified`
- ✅ Confidence improvement: ≥20-40%
- ✅ Attempts: 2-4
- ✅ Demonstrates learning capability

---

## Test Data Format

### Good/Bad Rules Format:
```json
{
  "id": "unique_id",
  "name": "Test case description",
  "file": "path/to/sample.mhtml",
  "hostname": "example.com",
  "category": "Category/Type",
  "rule": {
    "main": "CSS selector",
    "exclude": ["exclusion", "selectors"],
    "name": "Rule name"
  },
  "expected": {
    "status": "verified|failed",
    "minConfidence": 0.70,
    "maxAttempts": 2,
    "shouldRefine": false,
    "reason": "Why this should pass/fail"
  }
}
```

### Refinement Cases Format:
```json
{
  "id": "unique_id",
  "name": "Test case description",
  "file": "path/to/sample.mhtml",
  "hostname": "example.com",
  "category": "Category/Type",
  "initialRule": {
    "main": "Poor selector",
    "exclude": [],
    "name": "Initial rule"
  },
  "expectedRefinement": {
    "improvedSelector": "Better selector",
    "addedExclusions": ["new", "exclusions"],
    "confidenceIncrease": 0.30,
    "maxAttempts": 3
  },
  "expected": {
    "status": "verified",
    "minFinalConfidence": 0.70,
    "shouldImprove": true,
    "reason": "Expected improvement"
  }
}
```

---

## Usage

### Running Tests:
```bash
cd tests
node test_verification_performance.js
```

### Validating Test Data:
```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('test_data/good_rules.json')))"
```

---

## Test Coverage

### Website Categories:
- E-commerce (Amazon, Sephora, Best Buy, Walmart, etc.)
- Fashion (Macy's, Etsy)
- Real Estate (Zillow)
- Furniture (IKEA)
- Liquor (LCBO)
- Marketplace (Etsy)

### Selector Types:
- Semantic HTML5 (`main`, `article`)
- ID selectors (`#content`, `#root`)
- Class selectors (`.search-results`)
- Data attributes (`[data-testid]`)
- Multiple fallbacks

### Exclusion Patterns:
- Navigation (`header`, `nav`, `footer`)
- Ads (`[class*="ad"]`, `[id*="ad"]`)
- Media (`iframe`, `[class*="video"]`, `[class*="player"]`)
- UI elements (`.modal`, `.cookie-banner`, `aside`)
- Accessibility (`[aria-live]`, `[role="dialog"]`)

---

## Metrics to Measure

### Accuracy:
- True Positive Rate (good rules verified)
- True Negative Rate (bad rules rejected)
- Refinement Success Rate

### Performance:
- Average verification time
- Average attempts needed
- Timeout rate

### Quality:
- Confidence score distribution
- Refinement improvement delta
- Content preservation rate

---

## Success Criteria

**Must Have (P0)**:
- ✅ True Positive Rate ≥85%
- ✅ True Negative Rate ≥75%
- ✅ Average time ≤3 minutes

**Should Have (P1)**:
- ✅ Refinement success ≥60%
- ✅ Average confidence ≥80%
- ✅ Timeout rate ≤10%

---

## Notes

- All test files reference actual HTML samples in `tests/samples/`
- Test data is based on real-world website structures
- Expected results are based on manual analysis of each page
- Confidence thresholds are conservative estimates
