# Nano OS Health

Personal health app: Measurements · Intake & expenditure · Training. React + Firebase, hosted on GitHub Pages.

## Set-up (one time)

1. **Upload the code to GitHub.** Open https://github.com/Zippansz/HealthApp → *Add file → Upload files*. Drag in everything from the unzipped folder (including the `src` and `public` folders), then *Commit changes*.
   - The hidden `.github` folder is easy to miss. Instead, in GitHub click *Add file → Create new file*, type the name `.github/workflows/deploy.yml` and paste the contents of that file from this project.
2. **Turn on hosting.** Repo → *Settings → Pages → Source: GitHub Actions*. Then open the *Actions* tab; after a minute the site is live at https://zippansz.github.io/HealthApp/
3. **Firebase console** (project `healthapp-9c46d`):
   - *Authentication → Sign-in method →* enable **Google**.
   - *Authentication → Settings → Authorized domains →* add `zippansz.github.io`.
   - *Firestore Database → Create database* (production mode, region `eur3` or `europe-north1`).
   - *Firestore → Rules →* paste the contents of `firestore.rules` and **Publish**.
4. **Install on the Pixel:** open the site in Chrome → menu ⋮ → *Install app*.
5. **In the app → Settings:** paste your Gemini key (aistudio.google.com/apikey), review goals/phases, press *Save settings*.
6. **Load history:** Training → import the Hevy CSV files. Settings → import the Health Data Export CSVs. Measurements → paste your Excel rows.

Never commit CSV exports to the repo (the site is public). `.gitignore` already blocks them.
