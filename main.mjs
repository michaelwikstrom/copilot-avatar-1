// Copilot Avatar extension — shows a 3D Copilot head in a native window
// and displays agent responses beneath it as floating text.
import { joinSession } from "@github/copilot-sdk/extension";
import { join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { CopilotWebview } from "./lib/copilot-webview.js";

const settingsPath = join(import.meta.dirname, ".tts-settings.json");
let folderName = basename(process.cwd());

function formatTitle() {
    return `Copilot Avatar · ${folderName}`;
}

async function loadSettings() {
    try {
        return JSON.parse(await readFile(settingsPath, "utf-8"));
    } catch {
        return { enabled: false, rate: 1.1, voice: null };
    }
}

async function saveSettings(settings) {
    await writeFile(settingsPath, JSON.stringify(settings), "utf-8");
}

const webview = new CopilotWebview({
    extensionName: "copilot_avatar",
    contentDir: join(import.meta.dirname, "content"),
    title: formatTitle(),
    width: 600,
    height: 800,
    callbacks: {
        log: (msg, opts) => session.log(msg, opts),
        loadSettings: () => loadSettings(),
        saveSettings: (settings) => saveSettings(settings),
    },
});

async function syncTitle() {
    const title = formatTitle();
    webview.title = title;
    if (webview._handle) {
        await webview.eval(`document.title = ${JSON.stringify(title)}`, { timeoutMs: 2000 }).catch(() => {});
    }
}

async function evalWebview(expression, timeoutMs = 2000) {
    if (!webview._handle) return;
    await webview.eval(expression, { timeoutMs }).catch(() => {});
}

async function callWindowFunction(name, value, timeoutMs = 2000) {
    await evalWebview(`window.${name}(${JSON.stringify(value)})`, timeoutMs);
}

function getIntentText(event) {
    return event.data?.intent || event.data?.content || "";
}

function getToolLabel(toolName) {
    return (toolName || "").replace(/[_-]+/g, " ").trim();
}

function normalizeTurnText(text) {
    return String(text || "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_~>#-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function messageLooksSuccessful(text) {
    const normalized = normalizeTurnText(text);
    if (!normalized) return false;
    return /\b(done|completed|fixed|implemented|updated|added|created|pushed|refactored|resolved|finished|ready|working now)\b/.test(normalized);
}

function messageLooksFailed(text) {
    const normalized = normalizeTurnText(text);
    if (!normalized) return false;
    return /\b(failed|error|unable|cannot|can't|couldn't|blocked|not working|won't|problem|issue)\b/.test(normalized);
}

const rootTurnState = {
    hadFailure: false,
    sawMessage: false,
    lastMessage: "",
};

const session = await joinSession({
    tools: [
        {
            name: "copilot_avatar_show",
            description: "Open the Copilot avatar window. If already open, pass reload=true to refresh.",
            parameters: {
                type: "object",
                properties: {
                    reload: { type: "boolean", description: "If the window is already open, reload the page. Default false." },
                },
            },
            handler: async ({ reload = false } = {}) => {
                try {
                    await webview.show({ reload });
                    await syncTitle();
                    return reload ? "Avatar window refreshed." : "Avatar window opened.";
                } catch (e) {
                    return `Error: ${e.message}`;
                }
            },
        },
        ...webview.tools.filter(t => t.name !== "copilot_avatar_show"),
    ],
    commands: [{
        name: "avatar",
        description: "Open the Copilot 3D avatar window.",
        handler: async () => {
            await webview.show();
            await syncTitle();
        },
    }],
    hooks: {
        onSessionEnd: webview.close,
    },
});

session.on("session.start", (event) => {
    if (event.data?.context?.cwd) {
        folderName = basename(event.data.context.cwd);
        void syncTitle();
    }
});

session.on("session.resume", (event) => {
    if (event.data?.context?.cwd) {
        folderName = basename(event.data.context.cwd);
        void syncTitle();
    }
});

session.on("session.context_changed", (event) => {
    if (event.data?.cwd) {
        folderName = basename(event.data.cwd);
        void syncTitle();
    }
});

session.on("subagent.started", async (event) => {
    await callWindowFunction("addSubagent", {
        agentId: event.agentId ?? null,
        agentName: event.data?.agentName ?? "",
        displayName: event.data?.agentDisplayName ?? event.data?.agentName ?? "",
        description: event.data?.agentDescription ?? "",
        toolCallId: event.data?.toolCallId ?? null,
    }, 3000);
});

session.on("subagent.completed", async (event) => {
    await callWindowFunction("completeSubagent", {
        agentId: event.agentId ?? null,
        displayName: event.data?.agentDisplayName ?? event.data?.agentName ?? "",
        durationMs: event.data?.durationMs ?? null,
        totalToolCalls: event.data?.totalToolCalls ?? null,
    }, 3000);
});

session.on("subagent.failed", async (event) => {
    await callWindowFunction("failSubagent", {
        agentId: event.agentId ?? null,
        displayName: event.data?.agentDisplayName ?? event.data?.agentName ?? "",
        error: event.data?.error ?? "",
    }, 3000);
});

session.on("tool.execution_start", async (event) => {
    const toolName = event.data?.toolName ?? "";
    await callWindowFunction("setAgentActivity", {
        agentId: event.agentId ?? null,
        toolName,
        toolCallId: event.data?.toolCallId ?? null,
    });

    if (!event.agentId && toolName) {
        await callWindowFunction("setSubtask", getToolLabel(toolName));
    }
});

session.on("tool.execution_complete", async (event) => {
    if (!event.agentId && (event.data?.success === false || event.data?.error)) {
        rootTurnState.hadFailure = true;
    }

    await callWindowFunction("clearAgentActivity", {
        agentId: event.agentId ?? null,
        toolName: event.data?.toolName ?? "",
        toolCallId: event.data?.toolCallId ?? null,
    });
});

session.on("assistant.reasoning", async (event) => {
    await callWindowFunction("setAgentThinking", event.agentId ?? null);
});

session.on("assistant.intent", async (event) => {
    const intent = getIntentText(event);
    if (!intent) return;

    await callWindowFunction("setAgentIntent", {
        agentId: event.agentId ?? null,
        intent,
    });

    if (!event.agentId) {
        await callWindowFunction("setSubtask", intent);
    }
});

session.on("assistant.message", async (event) => {
    if (event.agentId) return;

    const text = event.data?.content;
    if (!text) return;
    rootTurnState.sawMessage = true;
    rootTurnState.lastMessage = text;
    await callWindowFunction("showMessage", text, 5000);
});

session.on("assistant.turn_start", async (event) => {
    if (event.agentId) return;
    rootTurnState.hadFailure = false;
    rootTurnState.sawMessage = false;
    rootTurnState.lastMessage = "";
    await evalWebview("window.setWorking(true)");
});

session.on("assistant.turn_end", async (event) => {
    if (event.agentId) return;
    await evalWebview("window.setWorking(false)");

    if (rootTurnState.hadFailure || messageLooksFailed(rootTurnState.lastMessage)) {
        await callWindowFunction("setAgentExpression", {
            agentId: null,
            expression: "failed",
            durationMs: 2200,
        });
        return;
    }

    if (rootTurnState.sawMessage && messageLooksSuccessful(rootTurnState.lastMessage)) {
        await callWindowFunction("setAgentExpression", {
            agentId: null,
            expression: "success",
            durationMs: 1700,
        });
    }
});
