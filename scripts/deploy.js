// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  console.log("🚀 Démarrage du déploiement du contrat SystemeGestionControles...");

  // Récupérer le déployeur
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Déploiement avec le compte:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance du compte:", hre.ethers.formatEther(balance), "ETH");

  // Déployer le contrat
  const SystemeGestionControles = await hre.ethers.getContractFactory("SystemeGestionControles");
  console.log("⏳ Déploiement en cours...");
  
  const systeme = await SystemeGestionControles.deploy();
  await systeme.waitForDeployment();

  const contractAddress = await systeme.getAddress();
  console.log("✅ Contrat déployé à l'adresse:", contractAddress);

  // Afficher les informations
  console.log("\n📋 Résumé du déploiement:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Contrat: SystemeGestionControles");
  console.log("Adresse:", contractAddress);
  console.log("Administrateur:", deployer.address);
  console.log("Réseau:", hre.network.name);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Enregistrer l'adresse pour le frontend
  const fs = require("fs");
  const contractInfo = {
    address: contractAddress,
    network: hre.network.name,
    deployer: deployer.address,
    deploymentTime: new Date().toISOString()
  };

  fs.writeFileSync(
    "./contract-address.json",
    JSON.stringify(contractInfo, null, 2)
  );
  
  console.log("📄 Adresse du contrat sauvegardée dans contract-address.json");

  // Instructions pour la suite
  console.log("\n📝 Prochaines étapes:");
  console.log("1. Mettez à jour l'adresse du contrat dans votre frontend React");
  console.log("2. Inscrivez les enseignants et étudiants avec la fonction d'admin");
  console.log("3. Les enseignants peuvent créer des devoirs");
  console.log("4. Les étudiants peuvent soumettre leurs devoirs");

  // Attendre quelques confirmations si on est sur un testnet
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n⏳ Attente de confirmations...");
    await systeme.deploymentTransaction().wait(5);
    console.log("✅ Déploiement confirmé!");

    // Vérification sur Etherscan (si applicable)
    if (process.env.ETHERSCAN_API_KEY) {
      console.log("\n🔍 Vérification du contrat sur Etherscan...");
      try {
        await hre.run("verify:verify", {
          address: contractAddress,
          constructorArguments: [],
        });
        console.log("✅ Contrat vérifié sur Etherscan!");
      } catch (error) {
        console.log("⚠️ Erreur lors de la vérification:", error.message);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Erreur lors du déploiement:", error);
    process.exit(1);
  });