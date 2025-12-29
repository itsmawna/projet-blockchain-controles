const hre = require("hardhat");
const readline = require("readline");
const fs = require("fs");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  let contractAddress;

  try {
    const contractInfo = JSON.parse(fs.readFileSync("./contract-address.json", "utf8"));
    contractAddress = contractInfo.address;
  } catch {
    contractAddress = await question("Adresse du contrat: ");
  }

  const [admin] = await hre.ethers.getSigners();
  const SystemeGestionControles = await hre.ethers.getContractFactory("SystemeGestionControles");
  const systeme = SystemeGestionControles.attach(contractAddress);

  let running = true;
  while (running) {
    console.log("\nMenu");
    console.log("1. Inscrire un enseignant");
    console.log("2. Inscrire un etudiant");
    console.log("3. Informations systeme");
    console.log("4. Quitter");

    const choice = await question("Choix: ");

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
        break;
      default:
        console.log("Choix invalide");
    }
  }

  rl.close();
}

async function inscrireEnseignant(systeme) {
  const adresse = await question("Adresse Ethereum: ");
  const nom = await question("Nom complet: ");

  try {
    const tx = await systeme.inscrireEnseignant(adresse, nom);
    await tx.wait();
    console.log("Enseignant inscrit");
  } catch (error) {
    console.error("Erreur:", error.message);
  }
}

async function inscrireEtudiant(systeme) {
  const adresse = await question("Adresse Ethereum: ");
  const nom = await question("Nom complet: ");
  const numero = await question("Numero etudiant: ");

  try {
    const tx = await systeme.inscrireEtudiant(adresse, nom, numero);
    await tx.wait();
    console.log("Etudiant inscrit");
  } catch (error) {
    console.error("Erreur:", error.message);
  }
}

async function listerInformations(systeme) {
  try {
    const admin = await systeme.administrateur();
    const devoirs = await systeme.compteurDevoirs();
    const soumissions = await systeme.compteurSoumissions();
    const annonces = await systeme.compteurAnnonces();

    console.log("Administrateur:", admin);
    console.log("Devoirs:", devoirs.toString());
    console.log("Soumissions:", soumissions.toString());
    console.log("Annonces:", annonces.toString());

    const verif = await question("Verifier une adresse (o/n): ");
    if (verif.toLowerCase() === "o") {
      const addr = await question("Adresse: ");
      const estEns = await systeme.estEnseignant(addr);
      const estEtu = await systeme.estEtudiant(addr);

      if (estEns) console.log("Enseignant");
      else if (estEtu) console.log("Etudiant");
      else console.log("Non inscrit");
    }
  } catch (error) {
    console.error("Erreur:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
