@echo off
echo ==================================================
echo Starting Self-Custodial Escrow (XUMM) Application
echo ==================================================

cd /d "%~dp0"

:: Create virtual environment if it doesn't exist
if not exist .venv (
    echo Creating Python virtual environment...
    python -m venv .venv
)

:: Start ngrok in a separate window
echo Starting ngrok tunnel in a new window...
start cmd /k "call .venv\Scripts\activate.bat && python start_ngrok.py"

:: Open app.js in an IDE
echo Opening app.js in IDE...
code static\app.js

:: Open the application in the default web browser
echo Opening application in browser...
start http://localhost:8000

:: Start the FastAPI server in a new window
echo Starting FastAPI backend server in a new terminal...
start cmd /k "call .venv\Scripts\activate.bat && pip install -r requirements.txt -q && python -m uvicorn main:app --reload"