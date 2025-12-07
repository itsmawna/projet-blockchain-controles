// scripts/manage-users.js
const hre = require("hardhat");
const readline = require("readline");

// Interface pour lire les entrées utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log("👥 Gestionnaire d'utilisateurs - Système de Gestion des Contrôles\n");

  // Charger l'adresse du contrat
  const fs = require("fs");
  let contractAddress;
  
  try {
    const contractInfo = JSON.parse(fs.readFileSync("./contract-address.json", "utf8"));
    contractAddress = contractInfo.address;
    console.log("📍 Contrat chargé:", contractAddress);
  } catch (error) {
    contractAddress = await question("Entrez l'adresse du contrat: ");
  }

  // Connexion au contrat
  const [admin] = await hre.ethers.getSigners();
  console.log("🔑 Admin connecté:", admin.address, "\n");

  const SystemeGestionControles = await hre.ethers.getContractFactory("SystemeGestionControles");
  const systeme = SystemeGestionControles.attach(contractAddress);

  // Menu principal
  let running = true;
  while (running) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Menu Principal");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("1. Inscrire un enseignant");
    console.log("2. Inscrire un étudiant");
    console.log("3. Lister les informations");
    console.log("4. Quitter");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const choice = await question("\nChoisissez une option (1-4): ");

    switch (choice) {
      case "1":
        await inscrireEnseignant(systeme);
        break;
      case "2":
        await inscrireEtudiant(systeme);
        break;
      case "3":
        await listerInformations(systeme);
        break;
      case "4":
        running = false;
        console.log("\n👋 Au revoir!");
        break;
      default:
        console.log("❌ Option invalide");
    }
  }

  rl.close();
}

async function inscrireEnseignant(systeme) {
  console.log("\n👨‍🏫 Inscription d'un enseignant");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const adresse = await question("Adresse Ethereum: ");
  const nom = await question("Nom complet: ");
  const clePublique = await question("Clé publique (optionnelle, appuyez sur Entrée pour auto): ");

  const finalClePublique = clePublique || `PUBLIC_KEY_${Date.now()}`;

  try {
    console.log("\n⏳ Inscription en cours...");
    const tx = await systeme.inscrireEnseignant(adresse, nom, finalClePublique);
    await tx.wait();
    console.log("✅ Enseignant inscrit avec succès!");
    console.log("📝 Transaction:", tx.hash);
  } catch (error) {
    console.error("❌ Erreur:", error.message);
  }
}

async function inscrireEtudiant(systeme) {
  console.log("\n👨‍🎓 Inscription d'un étudiant");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const adresse = await question("Adresse Ethereum: ");
  const nom = await question("Nom complet: ");
  const numeroEtudiant = await question("Numéro d'étudiant: ");

  try {
    console.log("\n⏳ Inscription en cours...");
    const tx = await systeme.inscrireEtudiant(adresse, nom, numeroEtudiant);
    await tx.wait();
    console.log("✅ Étudiant inscrit avec succès!");
    console.log("📝 Transaction:", tx.hash);
  } catch (error) {
    console.error("❌ Erreur:", error.message);
  }
}

async function listerInformations(systeme) {
  console.log("\n📊 Informations du système");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    const admin = await systeme.administrateur();
    console.log("👑 Administrateur:", admin);

    const compteurDevoirs = await systeme.compteurDevoirs();
    console.log("📝 Nombre de devoirs:", compteurDevoirs.toString());

    const compteurSoumissions = await systeme.compteurSoumissions();
    console.log("📤 Nombre de soumissions:", compteurSoumissions.toString());

    const compteurAnnonces = await systeme.compteurAnnonces();
    console.log("📢 Nombre d'annonces:", compteurAnnonces.toString());

    // Vérifier un utilisateur spécifique
    const verif = await question("\nVérifier une adresse? (o/n): ");
    if (verif.toLowerCase() === "o") {
      const addr = await question("Adresse à vérifier: ");
      const estEnseignant = await systeme.estEnseignant(addr);
      const estEtudiant = await systeme.estEtudiant(addr);
      
      if (estEnseignant) {
        console.log("✅ Cette adresse est un enseignant");
      } else if (estEtudiant) {
        console.log("✅ Cette adresse est un étudiant");
      } else {
        console.log("❌ Cette adresse n'est pas inscrite");
      }
    }
  } catch (error) {
    console.error("❌ Erreur:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });