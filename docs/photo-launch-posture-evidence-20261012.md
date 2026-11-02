# Photo posture verification evidence, 12 October 2026

The first production report's `passed` means its scripted transport, persistence and frozen exposure checks passed. Final visual review rejected the unsupported kneeling detail; that failure was preserved and the creator setting restored. The subsequent staging and production runs use the same source hash and add the stricter posture check. The final production review passed, and Dreka alone is active. No earlier failure was reclassified as a pass.

```json
{
  "scope": "Frozen-source verification only; no Telegram transport, financial writes, catalogue repair or video activation.",
  "original_production_transport_report": {
    "creator": "dreka-cakez",
    "clone_id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
    "source_id": "31a95666-c518-4992-a4d1-4ab12f78b858",
    "source_sha256": "37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b",
    "reference": {
      "yes": [
        "bare_buttocks",
        "lingerie",
        "suggestive_pose"
      ],
      "not_positive": [
        "nipples",
        "genitals",
        "anus",
        "full_nudity",
        "sexual_activity",
        "sex_toy",
        "swimwear"
      ],
      "garments": [
        "top",
        "thong"
      ]
    },
    "previous_model": "qwen/qwen3-vl-32b-instruct",
    "model": "qwen/qwen3.8-27b",
    "commit": "2c75cdaba1c1f6b64034a6205f35606f366ab2f9",
    "checks": [
      "Actual production upload action, private storage, saved facts, creator and price",
      "Authenticated catalogue refresh through public TLS proxy",
      "Duplicate retry saved once",
      "Original catalogue row and other creator settings unchanged"
    ],
    "previous_settings": {
      "id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
      "slug": "dreka-cakez",
      "vision_model": "qwen/qwen3-vl-32b-instruct",
      "photo_vision_enabled": true
    },
    "activation_at": "2026-10-12T07:28:56.269Z",
    "elapsed_ms": 112453,
    "upload_response": {
      "ok": true,
      "version": "v1",
      "clone": {
        "id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
        "slug": "dreka-cakez",
        "name": "Dreka Cakez"
      },
      "type": "photo",
      "uploaded": [
        "photo-launch-control-dreka-15-20261012.jpg"
      ],
      "failed": [],
      "note": "1 photo(s) saved. Check their analysis status in the media library before use."
    },
    "saved_result": {
      "id": "00602d64-0ce5-4e9b-a61c-4495a97583b4",
      "clone_id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
      "storage_path": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925/photos/0e860ce2297b4a312a50b20d2e485950-photo-launch-control-dreka-15-20261012.jpg",
      "caption": "peeking back at you from over my shoulder, my pink thong barely covering me 😏 can you spot the light switch behind me?",
      "teaser_caption": null,
      "star_value": 1260,
      "image_name": "photo-launch-control-dreka-15-20261012.jpg",
      "created_at": "2026-10-12T07:30:48.711426+00:00",
      "telegram_file_id": null,
      "is_nude": false,
      "explicitness": "suggestive",
      "is_free": false,
      "nsfw": false,
      "tags": [
        "solo",
        "ass",
        "lingerie"
      ],
      "auto_desc": "pink hair thong pose",
      "visual_description": "A woman with long pink hair in a purple top and pink thong kneels with her back to the camera in front of a white door. She wears a light purple short-sleeved top and pink underwear. Her body is angled to show her bare buttocks while she looks back over her right shoulder. The background features a white paneled door and a wall with a light switch. Not visible: nipples, genitals, anus.",
      "analysis_status": "analysed",
      "analysis_version": 2,
      "analysis_model": "qwen/qwen3.8-27b",
      "analysis_provider": "DeepInfra",
      "analysis_error": null,
      "analysed_at": "2026-10-12T07:30:48.687+00:00",
      "visual_facts": {
        "v": 2,
        "visible": [
          "pink hair",
          "purple top",
          "pink thong",
          "bare buttocks",
          "white door",
          "looking over shoulder"
        ],
        "evidence": {
          "anus": "no",
          "nipples": "no",
          "sex_toy": "no",
          "genitals": "no",
          "lingerie": "yes",
          "swimwear": "no",
          "full_nudity": "no",
          "bare_buttocks": "yes",
          "sexual_activity": "no",
          "suggestive_pose": "yes",
          "mirror_reflection": "no"
        }
      },
      "metadata_edited_at": null
    },
    "control_duplicate_held": true,
    "stored_sha256": "0e860ce2297b4a312a50b20d2e48595019faecf82151015dcacbdfe4bec7c25b",
    "final_control_row": {
      "id": "00602d64-0ce5-4e9b-a61c-4495a97583b4",
      "analysis_status": "needs_review",
      "analysis_error": "Controlled launch duplicate of existing creator-owned file; intentionally held after verification",
      "caption": null
    },
    "status": "passed"
  },
  "original_production_commercial_review": {
    "status": "failed",
    "reason": "kneeling is unconfirmed because the knees are outside the crop",
    "action": "test row held; previous creator model restored before the follow-up",
    "normalizer_followup_commit": "cb7958720a8467ec152928966790dbda36a1eb8f"
  },
  "followup_staging_report": {
    "run": "photo-launch-1791794545970",
    "project": "zqotxvrxuaocsonpizuw",
    "clone_id": "7e57f10f-0000-4000-8000-00000000f001",
    "model": "qwen/qwen3.8-27b",
    "transport": "actual HTTP, Next server action, Supabase storage/database and OpenRouter",
    "cases": [
      {
        "id": "dreka-production-control",
        "elapsed_ms": 82585,
        "source_sha256": "37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b",
        "stored_sha256": "0e860ce2297b4a312a50b20d2e48595019faecf82151015dcacbdfe4bec7c25b",
        "reference": {
          "id": "dreka-production-control",
          "file": "/tmp/photo-source-retained/photo-control-staging-20261012/dreka-15.jpg",
          "imageSha256": "37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b",
          "yes": [
            "bare_buttocks",
            "lingerie",
            "suggestive_pose"
          ],
          "not_positive": [
            "nipples",
            "genitals",
            "anus",
            "full_nudity",
            "sexual_activity",
            "sex_toy",
            "swimwear"
          ],
          "uncertain": [],
          "forbidden_posture": "kneeling because knees are outside the crop"
        },
        "row": {
          "id": "ed007d4b-f7c2-4b47-8d29-0442bb430e4a",
          "clone_id": "7e57f10f-0000-4000-8000-00000000f001",
          "storage_path": "7e57f10f-0000-4000-8000-00000000f001/photos/0e860ce2297b4a312a50b20d2e485950-photo-launch-1791794545970-dreka-production-control.jpg",
          "caption": "Low angle behind me, my bare ass in this pink G-string is all you can see. Head turned back, mouth open, eyes on you. Can you spy my arm tattoo? 😈🍑",
          "star_value": 350,
          "explicitness": "suggestive",
          "is_free": false,
          "tags": [
            "solo",
            "ass",
            "lingerie"
          ],
          "visual_description": "A woman with long pink hair in a lavender top and pink G-string poses from behind in front of a white door. She wears a fitted short-sleeve lavender top and a pink G-string, with bare buttocks facing the lens. Her head is turned over her shoulder, mouth slightly open, eyes toward the camera. The shot is taken from a low angle behind her. A small tattoo is visible on her upper arm. A white paneled door and a wall with light switches fill the background. Not visible: nipples, genitals, anus.",
          "created_at": "2026-10-12T08:43:50.443557+00:00",
          "teaser_caption": null,
          "image_name": "photo-launch-1791794545970-dreka-production-control.jpg",
          "is_nude": false,
          "nsfw": false,
          "auto_desc": "pink thong rear pose",
          "telegram_file_id": null,
          "analysis_status": "analysed",
          "analysis_version": 2,
          "analysis_model": "qwen/qwen3.8-27b",
          "analysis_provider": "DeepInfra",
          "analysis_error": null,
          "analysed_at": "2026-10-12T08:43:50.242+00:00",
          "visual_facts": {
            "v": 2,
            "visible": [
              "long pink hair",
              "lavender short-sleeve top",
              "pink G-string",
              "bare buttocks",
              "tattoo on upper arm",
              "white paneled door",
              "wall light switches",
              "rear pose",
              "over-shoulder look"
            ],
            "evidence": {
              "anus": "no",
              "nipples": "no",
              "sex_toy": "no",
              "genitals": "no",
              "lingerie": "yes",
              "swimwear": "no",
              "full_nudity": "no",
              "bare_buttocks": "yes",
              "sexual_activity": "no",
              "suggestive_pose": "yes",
              "mirror_reflection": "no"
            }
          },
          "metadata_edited_at": null
        }
      }
    ],
    "checks": [
      "Real dashboard login and authenticated media page",
      "1 actual uploads, original identity, private storage JPEG, saved facts/provider/status/prices and refreshed catalogue",
      "Paid/free values preserved",
      "Duplicate upload saves once and makes no duplicate model call",
      "Invalid image reports failure and creates no photo row",
      "Other creator photo ownership unchanged"
    ],
    "material_errors": [],
    "other_clone_rows_before": {
      "count": 5
    },
    "call_count": 2,
    "vision_call_count": 1,
    "status": "transport_pass",
    "setting_restored": true
  },
  "followup_staging_transport": [
    {
      "model": "qwen/qwen3.8-27b",
      "provider": {
        "only": [
          "deepinfra"
        ],
        "allow_fallbacks": false
      },
      "reasoning": {
        "effort": "xhigh",
        "exclude": true
      },
      "max_tokens": 16384,
      "temperature": 0,
      "response_format": {
        "type": "json_object"
      },
      "text_first": true,
      "has_image": true,
      "prompt_sha256": "9c79cd0b3bfcd05b33fb34557273d79e280a92bd52ab79fd74250e345f7c7e15",
      "stage": "first_or_caption",
      "http_status": 200,
      "latency_ms": 65972,
      "effective_model": "qwen/qwen3.8-27b",
      "effective_provider": "DeepInfra",
      "finish_reason": "stop",
      "content": "{\n  \"evidence\": {\n    \"nipples\": \"no\",\n    \"genitals\": \"no\",\n    \"anus\": \"no\",\n    \"bare_buttocks\": \"yes\",\n    \"full_nudity\": \"no\",\n    \"sexual_activity\": \"no\",\n    \"sex_toy\": \"no\",\n    \"swimwear\": \"no\",\n    \"lingerie\": \"yes\",\n    \"mirror_reflection\": \"no\",\n    \"suggestive_pose\": \"yes\"\n  },\n  \"identifying\": \"A woman with long pink hair in a lavender top and pink G-string poses from behind in front of a white door.\",\n  \"details\": \"She wears a fitted short-sleeve lavender top and a pink G-string, with bare buttocks facing the lens. Her head is turned over her shoulder, mouth slightly open, eyes toward the camera. The shot is taken from a low angle behind her. A small tattoo is visible on her upper arm. A white paneled door and a wall with light switches fill the background.\",\n  \"short_label\": \"pink thong rear pose\",\n  \"visible\": [\n    \"long pink hair\",\n    \"lavender short-sleeve top\",\n    \"pink G-string\",\n    \"bare buttocks\",\n    \"tattoo on upper arm\",\n    \"white paneled door\",\n    \"wall light switches\",\n    \"rear pose\",\n    \"over-shoulder look\"\n  ],\n  \"tags\": [\n    \"ass\",\n    \"lingerie\",\n    \"solo\"\n  ],\n  \"uncertainty_reasons\": {}\n}",
      "cost_usd": 0.0074709
    },
    {
      "model": "deepseek/deepseek-v4-flash",
      "temperature": 0.9,
      "text_first": false,
      "has_image": false,
      "prompt_sha256": null,
      "stage": "first_or_caption",
      "http_status": 200,
      "latency_ms": 5980,
      "effective_model": "deepseek/deepseek-v4-flash",
      "effective_provider": "GMICloud",
      "finish_reason": "stop",
      "content": "Low angle behind me, my bare ass in this pink G-string is all you can see. Head turned back, mouth open, eyes on you. Can you spy my arm tattoo? 😈🍑",
      "cost_usd": 0.000140686
    }
  ],
  "followup_production_report": {
    "creator": "dreka-cakez",
    "clone_id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
    "source_id": "31a95666-c518-4992-a4d1-4ab12f78b858",
    "source_sha256": "37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b",
    "reference": {
      "yes": [
        "bare_buttocks",
        "lingerie",
        "suggestive_pose"
      ],
      "not_positive": [
        "nipples",
        "genitals",
        "anus",
        "full_nudity",
        "sexual_activity",
        "sex_toy",
        "swimwear"
      ],
      "garments": [
        "top",
        "thong"
      ],
      "forbidden_posture": "kneeling; knees are outside this frozen crop"
    },
    "previous_model": "qwen/qwen3-vl-32b-instruct",
    "model": "qwen/qwen3.8-27b",
    "commit": "cb7958720a8467ec152928966790dbda36a1eb8f",
    "checks": [
      "Actual production upload action, private storage, saved facts, creator and price",
      "Authenticated catalogue refresh through public TLS proxy",
      "Duplicate retry saved once",
      "Original catalogue row and other creator settings unchanged"
    ],
    "previous_settings": {
      "id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
      "slug": "dreka-cakez",
      "vision_model": "qwen/qwen3-vl-32b-instruct",
      "photo_vision_enabled": true
    },
    "activation_at": "2026-10-12T08:52:11.876Z",
    "elapsed_ms": 107117,
    "upload_response": {
      "ok": true,
      "version": "v1",
      "clone": {
        "id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
        "slug": "dreka-cakez",
        "name": "Dreka Cakez"
      },
      "type": "photo",
      "uploaded": [
        "photo-launch-control-dreka-15-posture-20261012.jpg"
      ],
      "failed": [],
      "note": "1 photo(s) saved. Check their analysis status in the media library before use."
    },
    "saved_result": {
      "id": "92524d33-684d-46db-99d7-71e8c74f4600",
      "clone_id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
      "storage_path": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925/photos/0e860ce2297b4a312a50b20d2e485950-photo-launch-control-dreka-15-posture-20261012.jpg",
      "caption": "Back at ya from behind this door, pink thong strip perfectly in place as I peek over my shoulder. Think you can handle what’s on the other side? 😏🎀",
      "teaser_caption": null,
      "star_value": 1260,
      "image_name": "photo-launch-control-dreka-15-posture-20261012.jpg",
      "created_at": "2026-10-12T08:53:58.982123+00:00",
      "telegram_file_id": null,
      "is_nude": false,
      "explicitness": "suggestive",
      "is_free": false,
      "nsfw": false,
      "tags": [
        "solo",
        "ass",
        "lingerie"
      ],
      "auto_desc": "pink hair thong rear pose",
      "visual_description": "A woman with long pink hair in a light-pink top and pink thong poses rear-facing before a white door. She wears a fitted light-pink short-sleeve top and a pink thong with a thin back strip between the cheeks. The camera is low and behind her as she turns her head over her shoulder, mouth slightly open. A white paneled door fills the background with white walls, two light switches at left, and a pale counter edge at the bottom. A small dark tattoo is visible on her right upper arm. Not visible: nipples, genitals, anus.",
      "analysis_status": "analysed",
      "analysis_version": 2,
      "analysis_model": "qwen/qwen3.8-27b",
      "analysis_provider": "DeepInfra",
      "analysis_error": null,
      "analysed_at": "2026-10-12T08:53:58.934+00:00",
      "visual_facts": {
        "v": 2,
        "visible": [
          "long pink hair",
          "light-pink short-sleeve top",
          "pink thong",
          "bare buttocks",
          "rear pose looking back",
          "white paneled door",
          "light switches on wall",
          "pale counter edge",
          "tattoo on right arm"
        ],
        "evidence": {
          "anus": "no",
          "nipples": "no",
          "sex_toy": "no",
          "genitals": "no",
          "lingerie": "yes",
          "swimwear": "no",
          "full_nudity": "no",
          "bare_buttocks": "yes",
          "sexual_activity": "no",
          "suggestive_pose": "yes",
          "mirror_reflection": "no"
        }
      },
      "metadata_edited_at": null
    },
    "control_duplicate_held": true,
    "stored_sha256": "0e860ce2297b4a312a50b20d2e48595019faecf82151015dcacbdfe4bec7c25b",
    "final_control_row": {
      "id": "92524d33-684d-46db-99d7-71e8c74f4600",
      "analysis_status": "needs_review",
      "analysis_error": "Controlled launch duplicate of existing creator-owned file; intentionally held after verification",
      "caption": null
    },
    "status": "passed"
  },
  "followup_production_commercial_review": {
    "status": "passed",
    "source_sha256": "37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b",
    "review": "Frozen source re-inspected against saved facts and caption. Rear pose, pink hair, thong, visible cheeks and covered top agree; no kneeling or unsupported explicit claim. The top is described as light pink versus lavender in the staging run, a minor colour variation in this lighting, recorded rather than silently normalised.",
    "duplicate": "Intentionally held with caption cleared after original analysed result was captured; original catalogue item unchanged."
  },
  "final_live_verification": {
    "run": 38226462519,
    "job": 114735072877,
    "status": "passed",
    "receipts": [
      {
        "consumer": "V1",
        "commit": "278e3c3d639ae6384882735a42975718d93dbb32",
        "control_id": "92524d33-684d-46db-99d7-71e8c74f4600",
        "individual_excluded": true,
        "stale_bundle_facts_excluded": true,
        "transport": "none",
        "bundle": "synthetic in memory; real saved row"
      },
      {
        "consumer": "V2",
        "commit": "ef040a757627bb5813b4f19ac47af2c1f373506c",
        "control_id": "92524d33-684d-46db-99d7-71e8c74f4600",
        "individual_excluded": true,
        "stale_bundle_facts_excluded": true,
        "transport": "none",
        "bundle": "synthetic in memory; real saved row",
        "exclusion": "unverified_item:1:needs_review"
      },
      {
        "dashboard": "cb7958720a8467ec152928966790dbda36a1eb8f",
        "active_creators": [
          {
            "id": "c92560e7-1dd9-4e62-b5c3-04a30fbe4925",
            "slug": "dreka-cakez",
            "vision_model": "qwen/qwen3.8-27b",
            "photo_vision_enabled": true
          }
        ],
        "prepared_and_stored_bytes_match": true,
        "public_home_status": 200,
        "control_id": "92524d33-684d-46db-99d7-71e8c74f4600",
        "original_analysis_status": "analysed",
        "final_control_status": "needs_review"
      }
    ]
  },
  "production_runtime": {
    "commit": "cb7958720a8467ec152928966790dbda36a1eb8f",
    "image": "323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:50f75a5e00fcd27e0af8c4aaa185ab062effd9453cdb9ba87e041c4ab9e61d6f",
    "run": 38225455887,
    "verified_at": "2026-10-12T08:50:44Z",
    "photo_checks": "passed",
    "overall_workflow": "failure at existing video-preview gate: 45 passed, same 4 invalid sources as pre-release baseline"
  }
}
```
