#!/usr/bin/env python3
# ==============================================================================
# Standalone AI Agent Engine & Multi-Provider Bridge
# Supports:
# 1. Google Gemini Native API (Flash-Lite, Flash, Pro) with Function Calling
# 2. OpenAI-Compatible Custom Providers (Groq, OpenRouter, Together, Local Ollama)
# 3. Termux Tool Execution (bash command execution, file read, file write)
# 4. Strict WCAG 2.2 AAA accessibility and SSE streaming events
# ==============================================================================

import os
import sys
import json
import time
import urllib.request
import urllib.error
import urllib.parse
import subprocess
import logging
import threading

logger = logging.getLogger("custom-agent")

HOME_DIR = os.path.expanduser("~")
CUSTOM_CONFIG_FILE = os.path.expanduser("~/.gemini/custom_agent_config.json")
DEFAULT_GOOGLE_KEY = os.environ.get("GEMINI_API_KEY", "")

DEFAULT_FLASH_LITE_MODELS = [
    {
        "id": "gemini-flash-lite-latest",
        "name": "Gemini Flash-Lite Latest (الأسرع والأوفر)",
        "provider": "google",
        "context_window": "1M tokens",
        "description": "النموذج الرسمي الأحدث من عائلة فلاش لايت، فائق السرعة ومناسب لطلبات الاستخدام العالية المجانية."
    },
    {
        "id": "gemini-3.5-flash-lite",
        "name": "Gemini 3.5 Flash-Lite",
        "provider": "google",
        "context_window": "1M tokens",
        "description": "إصدار 3.5 فلاش لايت مستقر جداً وسريع في استدعاء أدوات وبرمجة Termux."
    },
    {
        "id": "gemini-3.1-flash-lite",
        "name": "Gemini 3.1 Flash-Lite",
        "provider": "google",
        "context_window": "1M tokens",
        "description": "نموذج 3.1 فلاش لايت عالي الاعتمادية وخفيف على الموارد."
    },
    {
        "id": "gemini-3.8-flash",
        "name": "Gemini 3.8 Flash (ذكاء متقدم)",
        "provider": "google",
        "context_window": "1M tokens",
        "description": "نموذج فلاش القياسي للأداء العالي والتفكير المنطقي المعقد."
    }
]

AGENT_TOOLS_GEMINI = [
    {
        "function_declarations": [
            {
                "name": "bash",
                "description": "Execute a safe bash command in the Termux environment and return its stdout and stderr.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "command": {
                            "type": "STRING",
                            "description": "The exact shell command to execute in Termux."
                        }
                    },
                    "required": ["command"]
                }
            },
            {
                "name": "read_file",
                "description": "Read the text content of a file from the local filesystem.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "path": {
                            "type": "STRING",
                            "description": "Absolute or home-relative path of the file to read."
                        }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "write_file",
                "description": "Create or overwrite a file with the specified content.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "path": {
                            "type": "STRING",
                            "description": "Absolute or home-relative path of the file to write."
                        },
                        "content": {
                            "type": "STRING",
                            "description": "Text content to write into the file."
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        ]
    }
]

def load_custom_agent_config() -> dict:
    """Loads custom agent settings, API keys, and custom providers atomically."""
    config = {
        "engine_mode": "antigravity",  # "antigravity" or "custom"
        "active_provider": "google",   # "google" or custom provider id
        "google_api_key": DEFAULT_GOOGLE_KEY,
        "selected_model": "gemini-flash-lite-latest",
        "custom_providers": [
            {
                "id": "groq",
                "name": "Groq Cloud (Llama / Mixtral)",
                "base_url": "https://api.groq.com/openai/v1",
                "api_key": "",
                "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
            },
            {
                "id": "openrouter",
                "name": "OpenRouter (Free & Open Source)",
                "base_url": "https://openrouter.ai/api/v1",
                "api_key": "",
                "models": ["meta-llama/llama-3.2-3b-instruct:free", "google/gemini-2.0-flash-exp:free"]
            }
        ]
    }
    if os.path.exists(CUSTOM_CONFIG_FILE):
        try:
            with open(CUSTOM_CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    config.update(saved)
                    if not config.get("google_api_key"):
                        config["google_api_key"] = DEFAULT_GOOGLE_KEY
        except Exception as e:
            logger.warning("Failed to parse custom agent config: %s", e)
    else:
        save_custom_agent_config(config)
    return config

def save_custom_agent_config(config: dict) -> bool:
    """Persists custom agent configuration atomically using tmp swap."""
    try:
        os.makedirs(os.path.dirname(CUSTOM_CONFIG_FILE), exist_ok=True)
        tmp_file = CUSTOM_CONFIG_FILE + ".tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, CUSTOM_CONFIG_FILE)
        return True
    except Exception as e:
        logger.error("Failed to save custom agent config: %s", e)
        return False

def execute_agent_tool(tool_name: str, args: dict, cwd: str = HOME_DIR) -> dict:
    """Executes a Termux system tool requested by the model and captures structured output."""
    cwd_path = cwd if (cwd and os.path.isdir(cwd)) else HOME_DIR
    if tool_name == "bash":
        cmd = args.get("command", "").strip()
        if not cmd:
            return {"error": "Empty command"}
        try:
            proc = subprocess.run(
                cmd,
                shell=True,
                cwd=cwd_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30.0
            )
            return {
                "exit_code": proc.returncode,
                "stdout": proc.stdout[:8000],
                "stderr": proc.stderr[:8000]
            }
        except subprocess.TimeoutExpired:
            return {"error": "Command timed out after 30 seconds"}
        except Exception as e:
            return {"error": str(e)}

    elif tool_name == "read_file":
        raw_path = args.get("path", "").strip()
        if not raw_path:
            return {"error": "Path required"}
        p = os.path.expanduser(raw_path)
        if not os.path.isabs(p):
            p = os.path.join(cwd_path, p)
        if not os.path.exists(p):
            return {"error": f"File not found: {raw_path}"}
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(16000)
            return {"path": p, "content": content}
        except Exception as e:
            return {"error": str(e)}

    elif tool_name == "write_file":
        raw_path = args.get("path", "").strip()
        content = args.get("content", "")
        if not raw_path:
            return {"error": "Path required"}
        p = os.path.expanduser(raw_path)
        if not os.path.isabs(p):
            p = os.path.join(cwd_path, p)
        try:
            os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(content)
            return {"success": True, "path": p, "bytes_written": len(content.encode("utf-8"))}
        except Exception as e:
            return {"error": str(e)}

    return {"error": f"Unknown tool: {tool_name}"}

def run_gemini_agent_turn(prompt: str, history: list, model: str, api_key: str, cwd: str, safe_send_func, max_turns: int = 5) -> dict:
    """Executes a multi-turn agent interaction loop with Gemini using function calling and live SSE broadcasting."""
    system_instruction = (
        "You are an expert, proactive AI software engineering agent running directly on an Android device via Termux. "
        "The user is Ahmed (أحمد), a blind Egyptian developer and historian who interacts using TalkBack and Jieshuo screen readers. "
        "Communicate in friendly, warm, clear Egyptian Arabic. Be direct, respectful, and concise. "
        "You have full access to bash, read_file, and write_file tools. Execute necessary commands without hesitation when needed."
    )

    contents = []
    # Ingest conversation history if provided
    for turn in history:
        r = turn.get("role", "user")
        txt = turn.get("text", "")
        if txt:
            contents.append({"role": "user" if r == "user" else "model", "parts": [{"text": txt}]})

    contents.append({"role": "user", "parts": [{"text": prompt}]})

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    total_tokens = 0
    turns_completed = 0

    while turns_completed < max_turns:
        turns_completed += 1
        payload = {
            "contents": contents,
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "tools": AGENT_TOOLS_GEMINI
        }

        req = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.error("Gemini API Error (%d): %s", e.code, err_body)
            safe_send_func(json.dumps({
                "type": "error",
                "message": f"خطأ من سيرفرات جوجل ({e.code}): {err_body[:200]}"
            }, ensure_ascii=False))
            return {"error": err_body}
        except Exception as e:
            logger.error("Gemini Connection Error: %s", e)
            safe_send_func(json.dumps({
                "type": "error",
                "message": f"تعذر الاتصال بـ Gemini API: {str(e)}"
            }, ensure_ascii=False))
            return {"error": str(e)}

        usage = resp_data.get("usageMetadata", {})
        total_tokens += usage.get("totalTokenCount", 0)

        candidates = resp_data.get("candidates", [])
        if not candidates:
            break

        cand = candidates[0]
        content_obj = cand.get("content", {})
        parts = content_obj.get("parts", [])

        # Check for function calls
        func_calls = []
        text_parts = []
        for p in parts:
            if "functionCall" in p:
                func_calls.append(p["functionCall"])
            if "text" in p:
                text_parts.append(p["text"])

        # Stream any direct text chunks generated
        if text_parts:
            combined_text = "".join(text_parts)
            safe_send_func(json.dumps({
                "type": "chunk",
                "text": combined_text
            }, ensure_ascii=False))

        # If no tools requested, we are done
        if not func_calls:
            contents.append(content_obj)
            break

        # Append model response to conversation contents
        contents.append(content_obj)

        # Execute each tool and append function responses
        response_parts = []
        for fc in func_calls:
            fn_name = fc.get("name")
            fn_args = fc.get("args", {})
            call_id = fc.get("id", "")

            # Notify UI of tool execution step
            safe_send_func(json.dumps({
                "type": "tool_step",
                "state": "RUNNING",
                "tool": fn_name,
                "params": fn_args,
                "output": ""
            }, ensure_ascii=False))

            tool_result = execute_agent_tool(fn_name, fn_args, cwd=cwd)

            safe_send_func(json.dumps({
                "type": "tool_step",
                "state": "DONE",
                "tool": fn_name,
                "params": fn_args,
                "output": json.dumps(tool_result, ensure_ascii=False)
            }, ensure_ascii=False))

            response_part = {
                "functionResponse": {
                    "name": fn_name,
                    "response": tool_result
                }
            }
            if call_id:
                response_part["functionResponse"]["id"] = call_id
            response_parts.append(response_part)

        contents.append({
            "role": "user",
            "parts": response_parts
        })

    # Send final result summary
    final_payload = json.dumps({
        "type": "result",
        "engine": "custom_gemini",
        "model": model,
        "tokens": total_tokens,
        "turns": turns_completed
    }, ensure_ascii=False)
    safe_send_func(final_payload)
    return {"status": "ok", "tokens": total_tokens}

def run_openai_compatible_agent_turn(prompt: str, history: list, model: str, base_url: str, api_key: str, cwd: str, safe_send_func) -> dict:
    """Connects to any standard OpenAI-compatible API endpoint (Groq, OpenRouter, Together, Local vLLM/Ollama)."""
    messages = [
        {
            "role": "system",
            "content": "You are a helpful software engineering assistant in Termux for Ahmed. Answer directly in friendly Egyptian Arabic."
        }
    ]
    for h in history:
        r = h.get("role", "user")
        txt = h.get("text", "")
        if txt:
            messages.append({"role": r, "content": txt})
    messages.append({"role": "user", "content": prompt})

    target_url = base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}" if api_key else ""
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True
    }

    req = urllib.request.Request(target_url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="ignore").strip()
                if not line or not line.startswith("data:"):
                    continue
                data_part = line[5:].strip()
                if data_part == "[DONE]":
                    break
                try:
                    delta_json = json.loads(data_part)
                    delta_text = delta_json.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta_text:
                        safe_send_func(json.dumps({"type": "chunk", "text": delta_text}, ensure_ascii=False))
                except Exception:
                    pass
    except Exception as e:
        logger.error("OpenAI Compatible Provider Error: %s", e)
        safe_send_func(json.dumps({
            "type": "error",
            "message": f"خطأ في الاتصال بالمزود المخصص: {str(e)}"
        }, ensure_ascii=False))
        return {"error": str(e)}

    safe_send_func(json.dumps({"type": "result", "engine": "custom_openai", "model": model}, ensure_ascii=False))
    return {"status": "ok"}
