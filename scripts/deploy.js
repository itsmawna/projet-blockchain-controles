// scripts/deploy.js
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("Demarrage du deploiement du contrat SystemeGestionControles");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Compte deployeur:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance du compte:", hre.ethers.formatEther(balance), "ETH");

  const SystemeGestionControles = await hre.ethers.getContractFactory("SystemeGestionControles");
  console.log("Deploiement en cours");

  const systeme = await SystemeGestionControles.deploy();
  await systeme.waitForDeployment();

  const contractAddress = await systeme.getAddress();
  console.log("Contrat deploye a l'adresse:", contractAddress);

  console.log("Resume du deploiement");
  console.log("Contrat: SystemeGestionControles");
  console.log("Adresse:", contractAddress);
  console.log("Administrateur:", deployer.address);
  console.log("Reseau:", hre.network.name);

  const contractInfo = {
    address: contractAddress,
    network: hre.network.name,
    deployer: deployer.address,
    deploymentTime: new Date().toISOString(),
  };

  fs.writeFileSync(
    "./contract-address.json",
    JSON.stringify(contractInfo, null, 2)
  );

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    await systeme.deploymentTransaction().wait(5);

    if (process.env.ETHERSCAN_API_KEY) {
      try {
        await hre.run("verify:verify", {
          address: contractAddress,
          constructorArguments: [],
        });
      } catch (error) {
        console.log("Erreur verification:", error.message);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erreur lors du deploiement:", error);
    process.exit(1);
  });
