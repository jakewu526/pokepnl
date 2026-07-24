# Run from the UAT checkout directory (e.g. "Pokemon App - UAT").
# Pulls the latest `uat` branch, rebuilds, and restarts the UAT NSSM service.
$ErrorActionPreference = "Stop"

git checkout uat
git pull

npm install
npx prisma generate
npx prisma migrate deploy
npm run build

nssm restart PokemonTCGApp-UAT

Write-Host "UAT deployed and restarted." -ForegroundColor Green
