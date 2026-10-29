@echo off
setlocal enabledelayedexpansion
echo === Starting Claude Code via LiteLLM ===
echo.
echo Make sure the LiteLLM proxy is running (start_litellm.ps1) before proceeding.
echo Usage: start-claude.bat [claude args...]
echo.
echo Choose model:
echo   1) gpt-5.4-mini      (Azure OpenAI)
echo   2) gpt-6-luna        (Azure OpenAI)
echo   3) gemini-3.8-flash  (Vertex AI, global)
echo   4) claude-opus-5     (Azure AI Foundry, Anthropic)
echo   5) nvidia/nemotron-3-ultra-550b-a55b  (NVIDIA NIM)
echo.

set "MODEL_CHOICE="
set /p MODEL_CHOICE=Enter choice [1-5] (default 1): 

if "%MODEL_CHOICE%"=="5" (
    set ANTHROPIC_MODEL=nvidia/nemotron-3-ultra-550b-a55b
) else if "%MODEL_CHOICE%"=="4" (
    set ANTHROPIC_MODEL=claude-opus-5
) else if "%MODEL_CHOICE%"=="3" (
    set ANTHROPIC_MODEL=gemini-3.8-flash
) else if "%MODEL_CHOICE%"=="2" (
    set ANTHROPIC_MODEL=gpt-6-luna
) else (
    set ANTHROPIC_MODEL=gpt-5.4-mini
)

set ANTHROPIC_BASE_URL=http://localhost:4000
set ANTHROPIC_API_KEY=sk-litellm-local

rem Azure's Anthropic endpoint rejects pre-release anthropic-beta headers (e.g. advisor-tool-*)
set CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1

rem Background tasks (titles, subagents) default to unconfigured aliases like claude-sonnet-5; pin them to the best-quality model per tier, regardless of the main model chosen above
set ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-5
set ANTHROPIC_DEFAULT_SONNET_MODEL=nvidia/nemotron-3-ultra-550b-a55b
set ANTHROPIC_DEFAULT_HAIKU_MODEL=gpt-6-luna

echo.
echo Using model: %ANTHROPIC_MODEL%
echo.

claude %*
