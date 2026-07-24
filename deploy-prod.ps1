# Run from the prod checkout directory ("Pokemon App").
# Pulls the latest `master` branch, rebuilds, and restarts the prod NSSM service.
$ErrorActionPreference = "Stop"

git checkout master
git pull

npm install
npx prisma generate
npx prisma migrate deploy
npm run build

nssm restart PokemonTCGApp

Write-Host "Prod deployed and restarted." -ForegroundColor Green
