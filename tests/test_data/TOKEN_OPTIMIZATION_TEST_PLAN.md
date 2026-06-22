# Token Optimization Test Datasets

## P0: DOM Validation Test Cases

Test DOM-based validation accuracy compared to LLM verification.

### Test Dataset: `test_data/dom_validation_cases.json`

```json
[
  {
    "id": "dom_001",
    "name": "Perfect extraction (high confidence)",
    "hostname": "example-perfect.com",
    "rawHTML": "<html><body><header>Nav</header><main><h1>Title</h1><p>Content paragraph 1.</p><p>Content paragraph 2.</p></main><footer>Footer</footer></body></html>",
    "extractedHTML": "<main><h1>Title</h1><p>Content paragraph 1.</p><p>Content paragraph 2.</p></main>",
    "rule": {"main": "main", "exclude": ["header", "footer"]},
    "expectedDOMConfidence": 0.85,
    "expectedDOMMethod": "dom-only",
    "expectedValid": true,
    "notes": "Clean extraction, should use DOM only"
  },
  {
    "id": "dom_002",
    "name": "Poor extraction (low confidence)",
    "hostname": "example-poor.com",
    "rawHTML": "<html><body><header>Nav</header><main><h1>Title</h1><p>Content</p></main><footer>Footer</footer></body></html>",
    "extractedHTML": "<html><body><header>Nav</header><main><h1>Title</h1><p>Content</p></main><footer>Footer</footer></body></html>",
    "rule": {"main": "body", "exclude": []},
    "expectedDOMConfidence": 0.15,
    "expectedDOMMethod": "dom-only",
    "expectedValid": false,
    "notes": "No extraction applied, should use DOM only"
  },
  {
    "id": "dom_003",
    "name": "Borderline extraction (needs LLM)",
    "hostname": "example-borderline.com",
    "rawHTML": "<html><body><nav>Menu</nav><article><h2>Title</h2><p>Text</p></article><aside>Sidebar</aside></body></html>",
    "extractedHTML": "<article><h2>Title</h2><p>Text</p></article><aside>Sidebar</aside>",
    "rule": {"main": "article", "exclude": ["nav"]},
    "expectedDOMConfidence": 0.5,
    "expectedDOMMethod": "llm-verified",
    "expectedValid": false,
    "notes": "Has sidebar (noise), borderline case needs LLM"
  },
  {
    "id": "dom_004",
    "name": "Good extraction with minor noise",
    "hostname": "example-minor-noise.com",
    "rawHTML": "<html><body><header>Nav</header><main><h1>Article</h1><p>Para 1</p><p>Para 2</p><p>Para 3</p><script>ads</script></main></body></html>",
    "extractedHTML": "<main><h1>Article</h1><p>Para 1</p><p>Para 2</p><p>Para 3</p><script>ads</script></main>",
    "rule": {"main": "main", "exclude": ["header"]},
    "expectedDOMConfidence": 0.7,
    "expectedDOMMethod": "dom-only",
    "expectedValid": true,
    "notes": "Has script tag but good content coverage"
  },
  {
    "id": "dom_005",
    "name": "Over-extraction (too much text)",
    "hostname": "example-over.com",
    "rawHTML": "<html><body><main><p>Content</p></main></body></html>",
    "extractedHTML": "<html><head><title>Page</title></head><body><nav>Menu</nav><main><p>Content</p></main><footer>Footer</footer></body></html>",
    "rule": {"main": "html", "exclude": []},
    "expectedDOMConfidence": 0.2,
    "expectedDOMMethod": "dom-only",
    "expectedValid": false,
    "notes": "Extracted more than original, clearly wrong"
  }
]
```

### Success Criteria for P0

- ✅ DOM validation matches expected confidence ±0.1
- ✅ DOM-only method used for confidence ≥0.7 or ≤0.3
- ✅ LLM method used for confidence 0.3-0.7
- ✅ Token usage: 80%+ cases use 0 tokens (DOM only)
- ✅ Accuracy: DOM validation agrees with LLM ≥85%

## P1: Structure Analysis Test Cases

Test client-side HTML structure analysis and selector detection.

### Test Dataset: `test_data/structure_analysis_cases.json`

```json
[
  {
    "id": "struct_001",
    "name": "Semantic HTML (easy)",
    "hostname": "semantic-site.com",
    "html": "<html><body><main><article><h1>Title</h1><p>Content</p></article></main></body></html>",
    "expectedCandidates": [
      {"selector": "main", "score": 100},
      {"selector": "article", "score": 100}
    ],
    "expectedNoise": ["header", "nav", "footer", "aside"],
    "expectedBestSelector": "main",
    "notes": "Should find semantic elements easily"
  },
  {
    "id": "struct_002",
    "name": "ID-based content (medium)",
    "hostname": "id-based-site.com",
    "html": "<html><body><div id='header'>Nav</div><div id='content'><h1>Title</h1><p>Text</p></div><div id='sidebar'>Ads</div></body></html>",
    "expectedCandidates": [
      {"selector": "#content", "score": 80}
    ],
    "expectedNoise": [],
    "expectedBestSelector": "#content",
    "notes": "Should find #content by ID"
  },
  {
    "id": "struct_003",
    "name": "Class-based content (medium)",
    "hostname": "class-based-site.com",
    "html": "<html><body><div class='header'>Nav</div><div class='main-content'><h1>Title</h1><p>Text</p></div></body></html>",
    "expectedCandidates": [
      {"selector": ".main-content", "score": 80}
    ],
    "expectedNoise": [],
    "expectedBestSelector": ".main-content",
    "notes": "Should find .main-content by class"
  },
  {
    "id": "struct_004",
    "name": "Heuristic detection (hard)",
    "hostname": "heuristic-site.com",
    "html": "<html><body><div><nav>Menu</nav></div><div><h1>Article</h1><p>Long paragraph 1.</p><p>Long paragraph 2.</p><p>Long paragraph 3.</p></div><div>Footer</div></body></html>",
    "expectedCandidates": [
      {"selector": "div", "score": 60, "note": "Largest text container"}
    ],
    "expectedNoise": ["nav"],
    "expectedBestSelector": "div:nth-child(2)",
    "notes": "Should use heuristic (largest text container)"
  },
  {
    "id": "struct_005",
    "name": "Complex nested structure",
    "hostname": "complex-site.com",
    "html": "<html><body><div id='app'><header>Nav</header><div class='container'><aside>Sidebar</aside><main><article><h1>Title</h1><p>Content</p></article></main></div></div></body></html>",
    "expectedCandidates": [
      {"selector": "main", "score": 100},
      {"selector": "article", "score": 100},
      {"selector": "#app", "score": 60}
    ],
    "expectedNoise": ["header", "aside"],
    "expectedBestSelector": "main",
    "notes": "Should prefer semantic main over #app"
  }
]
```

### Success Criteria for P1

- ✅ Finds correct main selector in ≥90% of cases
- ✅ Identifies all noise elements present
- ✅ Ranks candidates correctly (semantic > ID > class > heuristic)
- ✅ Token savings: 50% reduction in generation prompt size
- ✅ Generated rules use only verified selectors

## P2: Smart Refinement Test Cases

Test rule-based refinement vs LLM refinement.

### Test Dataset: `test_data/smart_refinement_cases.json`

```json
[
  {
    "id": "refine_001",
    "name": "High confidence - add exclusions only",
    "hostname": "refine-high.com",
    "previousRule": {"main": "main", "exclude": ["header", "footer"]},
    "domMetrics": {
      "confidence": 0.55,
      "textRatio": 0.6,
      "hasNav": true,
      "hasAds": false
    },
    "expectedMethod": "rule-based",
    "expectedTokens": 0,
    "expectedNewRule": {
      "main": "main",
      "exclude": ["header", "footer", "nav", "[role='navigation']"]
    },
    "notes": "Confidence ≥0.5, just add nav exclusions"
  },
  {
    "id": "refine_002",
    "name": "High confidence - add ad exclusions",
    "hostname": "refine-ads.com",
    "previousRule": {"main": "article", "exclude": []},
    "domMetrics": {
      "confidence": 0.52,
      "textRatio": 0.5,
      "hasNav": false,
      "hasAds": true
    },
    "expectedMethod": "rule-based",
    "expectedTokens": 0,
    "expectedNewRule": {
      "main": "article",
      "exclude": ["[class*='ad']", "[id*='ad']", ".advertisement"]
    },
    "notes": "Confidence ≥0.5, just add ad exclusions"
  },
  {
    "id": "refine_003",
    "name": "Low confidence - needs LLM",
    "hostname": "refine-low.com",
    "previousRule": {"main": "body", "exclude": []},
    "domMetrics": {
      "confidence": 0.15,
      "textRatio": 0.95,
      "hasNav": true,
      "hasAds": true
    },
    "expectedMethod": "llm",
    "expectedTokens": 1500,
    "expectedNewRule": {
      "main": "main, article, #content",
      "exclude": ["header", "nav", "footer", "[class*='ad']"]
    },
    "notes": "Confidence <0.5, needs LLM to fix main selector"
  },
  {
    "id": "refine_004",
    "name": "Medium confidence - borderline",
    "hostname": "refine-medium.com",
    "previousRule": {"main": "main", "exclude": ["header"]},
    "domMetrics": {
      "confidence": 0.48,
      "textRatio": 0.4,
      "hasNav": true,
      "hasAds": true
    },
    "expectedMethod": "rule-based",
    "expectedTokens": 0,
    "expectedNewRule": {
      "main": "main",
      "exclude": ["header", "nav", "[role='navigation']", "[class*='ad']", "[id*='ad']", ".advertisement"]
    },
    "notes": "Close to 0.5, try rule-based first"
  },
  {
    "id": "refine_005",
    "name": "Perfect extraction - no refinement needed",
    "hostname": "refine-perfect.com",
    "previousRule": {"main": "article", "exclude": ["header", "footer", "nav"]},
    "domMetrics": {
      "confidence": 0.85,
      "textRatio": 0.5,
      "hasNav": false,
      "hasAds": false
    },
    "expectedMethod": "none",
    "expectedTokens": 0,
    "expectedNewRule": null,
    "notes": "Confidence ≥0.8, no refinement needed"
  }
]
```

### Success Criteria for P2

- ✅ Rule-based refinement used for confidence ≥0.5 (0 tokens)
- ✅ LLM refinement used for confidence <0.5 (~1.5K tokens)
- ✅ No refinement for confidence ≥0.8
- ✅ Token savings: 98% reduction in refinement costs
- ✅ Refinement success rate: ≥70%

## Integration Test Plan

### Full Pipeline Test (30 hostnames)

**Objective:** Validate entire token-efficient system end-to-end.

**Test Cases:**
- 10 good rules (should verify quickly with DOM)
- 10 bad rules (should refine with minimal LLM calls)
- 10 edge cases (mix of DOM and LLM)

**Metrics to Track:**
1. **Token Usage Per Hostname:**
   - Generation tokens
   - Verification tokens (DOM vs LLM)
   - Refinement tokens (rule-based vs LLM)
   - Total tokens

2. **Method Distribution:**
   - % DOM-only verifications
   - % LLM verifications
   - % Rule-based refinements
   - % LLM refinements

3. **Success Rates:**
   - Verification accuracy
   - Refinement success rate
   - Final confidence scores

4. **Performance:**
   - Average time per hostname
   - Total test suite time
   - Quota usage

**Success Criteria:**
- ✅ Average <10K tokens per hostname
- ✅ Total <300K tokens for 30 tests (within quota)
- ✅ 80%+ verifications use DOM only
- ✅ 70%+ refinements use rule-based
- ✅ No quota exceeded errors
- ✅ Refinement success rate ≥60%

## Test Execution Order

1. **Phase 1: P0 DOM Validation**
   - Run `test_dom_validation.js` with 5 test cases
   - Validate accuracy and token savings
   - Fix any issues before proceeding

2. **Phase 2: P1 Structure Analysis**
   - Run `test_structure_analysis.js` with 5 test cases
   - Validate selector detection
   - Measure token savings in generation

3. **Phase 3: P2 Smart Refinement**
   - Run `test_smart_refinement.js` with 5 test cases
   - Validate rule-based vs LLM decision
   - Measure token savings in refinement

4. **Phase 4: Integration Test**
   - Run `test_token_efficient_pipeline.js` with 30 test cases
   - Track all metrics
   - Generate comprehensive report

5. **Phase 5: Validation**
   - Compare results with baseline (old system)
   - Validate token reduction achieved
   - Confirm no regression in accuracy
