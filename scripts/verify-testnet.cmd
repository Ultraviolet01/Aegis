@echo off
setlocal enabledelayedexpansion
REM ===========================================================================
REM Verify the X Layer testnet deployment on OKLink.
REM
REM   scripts\verify-testnet.cmd            verify all four contracts
REM   scripts\verify-testnet.cmd check      re-check status of all four
REM
REM Key: uses OKLINK_API_KEY if set, otherwise falls back to OKX_API_KEY.
REM      The OKX DEX key was confirmed working against this endpoint.
REM
REM Compiler version is v0.8.33, NOT the 0.8.24 in the pragma — the pragma
REM floats (^0.8.24) and Foundry resolved 0.8.33. Confirmed by byte-for-byte
REM comparison against on-chain code: node scripts\verify-xlayer.mjs preflight
REM
REM Optimizer was OFF for this build, so --num-of-optimizations is deliberately
REM NOT passed; adding it would change the bytecode and fail verification.
REM ===========================================================================

cd /d "%~dp0.."
set "PATH=C:\Users\USER\.foundry\bin;%PATH%"

REM --- load the API key from .env without printing it ---
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "OKLINK_API_KEY=" .env`) do set "APIKEY=%%b"
if "%APIKEY%"=="" (
  for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "OKX_API_KEY=" .env`) do set "APIKEY=%%b"
  echo [i] OKLINK_API_KEY empty - falling back to OKX_API_KEY
)
if "%APIKEY%"=="" (
  echo [x] No API key found in .env ^(need OKLINK_API_KEY or OKX_API_KEY^).
  exit /b 1
)

set "VURL=https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER_TESTNET"
set "SOLC=v0.8.33+commit.64118f21"
set "CHAIN=1952"

set "OWNER=0x296136A59463174f02898dE2C53b4a036eFC8c5e"
set "AGENT=0xF14671A7966F8877fa597877D2072e8841d0bb52"
set "VAULT=0xc96d34534270B3ff41b5b4e30731c980FdfEd8DB"
set "EVAULT=0xA33e3050b185B9289C1732d71C53B0c36A25Fe61"
set "REGISTRY=0x90346e8ebB6fb000c97BbcdE93D7C5C192396Fd2"
set "ORACLE=0xEB0538B1c199eC063B7E6e785572ed4402D94074"

REM abi-encoded constructor args (cast abi-encode), matching broadcast/run-*.json
set "ARGS_VAULT=0x000000000000000000000000a33e3050b185b9289c1732d71c53b0c36a25fe61000000000000000000000000f14671a7966f8877fa597877d2072e8841d0bb52000000000000000000000000296136a59463174f02898de2c53b4a036efc8c5e"
set "ARGS_EVAULT=0x0000000000000000000000000000000000000000000000000000000000015180000000000000000000000000296136a59463174f02898de2c53b4a036efc8c5e"
set "ARGS_REGISTRY=0x000000000000000000000000c96d34534270b3ff41b5b4e30731c980fdfed8db"
set "ARGS_ORACLE=0x000000000000000000000000296136a59463174f02898de2c53b4a036efc8c5e"

if /i "%~1"=="check" goto :checkall

call :verify %VAULT%    src/AegisVault.sol:AegisVault         "%ARGS_VAULT%"
call :verify %EVAULT%   src/EmergencyVault.sol:EmergencyVault "%ARGS_EVAULT%"
call :verify %REGISTRY% src/PolicyRegistry.sol:PolicyRegistry "%ARGS_REGISTRY%"
call :verify %ORACLE%   src/RiskOracle.sol:RiskOracle         "%ARGS_ORACLE%"

:checkall
echo.
echo ================ verification status ================
call :check %VAULT%    AegisVault
call :check %EVAULT%   EmergencyVault
call :check %REGISTRY% PolicyRegistry
call :check %ORACLE%   RiskOracle
goto :eof

:verify
echo.
echo --- submitting %~2
forge verify-contract %~1 %~2 --chain %CHAIN% --verifier oklink --verifier-url "%VURL%" --api-key %APIKEY% --compiler-version %SOLC% --constructor-args %~3
goto :eof

:check
for /f "tokens=*" %%r in ('forge verify-check %~1 --chain %CHAIN% --verifier oklink --verifier-url "%VURL%" --api-key %APIKEY% 2^>^&1 ^| findstr /c:"Details"') do set "RES=%%r"
echo %~2: !RES!
set "RES="
goto :eof
