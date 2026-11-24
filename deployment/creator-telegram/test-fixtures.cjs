const assert = require("node:assert/strict");
global.fetch = async (input, init = {}) => {
    const u = new URL(input instanceof Request ? input.url : input);
    assert.equal((init.method || "GET").toUpperCase(), "GET");
    const accountId = "75df7b21-b83d-49c6-bf35-4d33fc68f80f", cloneId = "e66c7b0a-21b5-48cc-9611-bd09f6b9f96a";
    let data;
    switch (u.pathname.split("/").at(-1)) {
        case "creator_accounts":
            data = [{ id: accountId, auth_user_id: "example-user", display_name: "Example", account_status: "active", source: "twin" }];
            break;
        case "creator_applications":
            data = [];
            break;
        case "creator_agency_assignments":
            data = [];
            break;
        case "creator_clone_links":
            data = [{ clone_id: null, twin_slug: "randy", clones: null }];
            break;
        case "clones":
            data = [{ id: cloneId }];
            break;
        case "fans":
            assert.equal(u.searchParams.get("girl"), "randy");
            data = [{ chatId: 100, name: "Example fan", messages: 1, lastSeen: "2026-11-23T17:45:00Z" }];
            break;
        case "chat-history":
            assert.equal(u.searchParams.get("girl"), "randy");
            assert.equal(u.searchParams.get("chatId"), "100");
            data = { history: [{ id: "test", content: "Example only.", at: "2026-11-23T17:45:00Z", role: "user", delivery: "received" }], hasMore: false };
            break;
        default: throw new Error("Unmocked request");
    }
    return Response.json(data);
};
