# Workflow senza PC/Mac

Finché lavori solo da iPhone:

1. Carica questa Store Edition in un repository GitHub dedicato o in una cartella `store-edition`.
2. GitHub Actions può verificare automaticamente Android e iOS senza un computer locale.
3. Quando Google Play è verificato, configureremo una upload key sicura e una workflow che genera il file `.aab` firmato.
4. Quando Apple Developer è approvato, configureremo App Store Connect e una workflow/macOS build per TestFlight con firma Apple.
5. Le chiavi di firma resteranno in GitHub Secrets, non nei file pubblici.
