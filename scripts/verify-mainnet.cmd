@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0.."
set "PATH=C:\Users\USER\.foundry\bin;%PATH%"

set "APIKEY=dummykey123"
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "OKLINK_API_KEY=" .env`) do set "APIKEY=%%b"
if "%APIKEY%"=="" (
  for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "OKX_API_KEY=" .env`) do set "APIKEY=%%b"
)

set "VURL=https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER"
set "SOLC=v0.8.33+commit.64118f21"
set "CHAIN=196"

set "OWNER=0x3A29893814c82A6047E4Aa56dec640A5e65985c1"
set "AGENT=0xF14671A7966F8877fa597877D2072e8841d0bb52"
set "VAULT=0x8066b72f9E87Ca2CFD29e41D6DEd92f6bD1aC675"
set "EVAULT=0x55E943aeC4FB74Dd5c97a85BacddBDa4B98B5De2"
set "REGISTRY=0xf5c1c62bEEc5CDB4D3b596649C78f513BA5C869a"
set "ORACLE=0x2a017C7eb8030eA7150a62Abb313cb4E358d1DA6"

set "ARGS_EVAULT=0x00000000000000000000000000000000000000000000000000000000000151800000000000000000000000003a29893814c82a6047e4aa56dec640a5e65985c1"
set "ARGS_VAULT=0x00000000000000000000000055e943aec4fb74dd5c97a85bacddbda4b98b5de2000000000000000000000000f14671a7966f8877fa597877d2072e8841d0bb520000000000000000000000003a29893814c82a6047e4aa56dec640a5e65985c1"
set "ARGS_REGISTRY=0x0000000000000000000000008066b72f9e87ca2cfd29e41d6ded92f6bd1ac675"
set "ARGS_ORACLE=0x0000000000000000000000003a29893814c82a6047e4aa56dec640a5e65985c1"

if /i "%~1"=="check" goto :checkall

call :verify %EVAULT%   src/EmergencyVault.sol:EmergencyVault "%ARGS_EVAULT%"
call :verify %VAULT%    src/AegisVault.sol:AegisVault         "%ARGS_VAULT%"
call :verify %REGISTRY% src/PolicyRegistry.sol:PolicyRegistry "%ARGS_REGISTRY%"
call :verify %ORACLE%   src/RiskOracle.sol:RiskOracle         "%ARGS_ORACLE%"

:checkall
echo.
echo ================ mainnet verification status ================
call :check %EVAULT%   EmergencyVault
call :check %VAULT%    AegisVault
call :check %REGISTRY% PolicyRegistry
call :check %ORACLE%   RiskOracle
goto :eof

:verify
echo.
echo --- submitting %~2 (%~1)
forge verify-contract %~1 %~2 --chain %CHAIN% --verifier oklink --verifier-url "%VURL%" --api-key %APIKEY% --compiler-version %SOLC% --constructor-args %~3
goto :eof

:check
for /f "tokens=*" %%r in ('forge verify-check %~1 --chain %CHAIN% --verifier oklink --verifier-url "%VURL%" --api-key %APIKEY% 2^>^&1 ^| findstr /c:"Details"') do set "RES=%%r"
echo %~2: !RES!
set "RES="
goto :eof
