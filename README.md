# 📚 Système de Gestion des Contrôles - Blockchain

> Projet Final - Module Fondamentaux de la Blockchain (M356)  
> ENSA Tétouan - Département IA & Digitalisation

![Blockchain](https://img.shields.io/badge/Blockchain-Ethereum-blue)
![Solidity](https://img.shields.io/badge/Solidity-0.8.19-green)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 🎯 À Propos

Plateforme décentralisée de gestion des contrôles et devoirs utilisant la technologie blockchain pour garantir la transparence, la sécurité et l'équité dans le processus éducatif.

### ✨ Caractéristiques Principales

- ✅ **Transparence totale** : Toutes les transactions sont publiques et vérifiables
- 🔒 **Sécurité RSA** : Chiffrement des soumissions pour empêcher la tricherie
- 🛡️ **Anti-plagiat** : Chaque soumission est unique grâce au chiffrement
- ⛓️ **Immuabilité** : Les données ne peuvent pas être modifiées
- 👥 **Équité** : Droits égaux pour tous les participants
- 📊 **Traçabilité** : Historique complet de toutes les actions

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (React)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Enseignants  │  │  Étudiants   │  │   Admin   │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │ Ethers.js
                        ▼
┌─────────────────────────────────────────────────────┐
│              SMART CONTRACT (Solidity)               │
│  ┌─────────────────────────────────────────────┐   │
│  │   SystemeGestionControles.sol               │   │
│  │   • Gestion des devoirs                     │   │
│  │   • Soumissions chiffrées                   │   │
│  │   • Corrections                              │   │
│  │   • Annonces                                 │   │
│  └─────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              BLOCKCHAIN ETHEREUM                     │
│         (Immuable, Décentralisée, Sécurisée)        │
└─────────────────────────────────────────────────────┘
```

## 🚀 Installation Rapide

### Prérequis

- Node.js v16+
- NPM ou Yarn
- MetaMask
- Git

### Étape 1 : Cloner le projet

```bash
git clone <url-du-repo>
cd systeme-gestion-controles-blockchain
```

### Étape 2 : Installer les dépendances

```bash
# Backend
npm install

# Frontend
cd frontend
npm install
cd ..
```

### Étape 3 : Configuration

```bash
# Copier le fichier d'environnement
cp .env.example .env

# Éditer .env avec vos valeurs
nano .env
```

### Étape 4 : Compiler le contrat

```bash
npx hardhat compile
```

### Étape 5 : Démarrer le réseau local

```bash
# Terminal 1
npx hardhat node
```

### Étape 6 : Déployer le contrat

```bash
# Terminal 2
npx hardhat run scripts/deploy.js --network localhost
```

### Étape 7 : Lancer l'interface

```bash
cd frontend
npm start
```

Accéder à `http://localhost:3000` 🎉

## 📖 Guide d'Utilisation

### Pour l'Administrateur

1. **Connecter le wallet** avec l'adresse de déployeur
2. **Inscrire les enseignants** via le script ou l'interface
3. **Inscrire les étudiants**

```bash
# Utiliser le script interactif
npx hardhat run scripts/manage-users.js --network localhost
```

### Pour les Enseignants

1. **Se connecter** avec MetaMask
2. **Créer un devoir** :
   - Titre et description
   - Date limite
   - Le système génère automatiquement les clés RSA
3. **Corriger les soumissions** :
   - Déchiffrer les réponses avec la clé privée
   - Attribuer notes et commentaires

### Pour les Étudiants

1. **Se connecter** avec MetaMask
2. **Consulter les devoirs** disponibles
3. **Soumettre un devoir** :
   - Choisir le devoir
   - Rédiger les réponses
   - Le système chiffre automatiquement
4. **Consulter les résultats**

## 🔒 Sécurité

### Chiffrement RSA

Chaque devoir utilise une paire de clés unique :

```javascript
// L'enseignant génère les clés
const keyPair = {
  publicKey: "PUBLIC_KEY_...",  // Partagée avec les étudiants
  privateKey: "PRIVATE_KEY_..." // Gardée secrète par l'enseignant
}

// L'étudiant chiffre sa soumission
const encrypted = encryptRSA(response, publicKey);

// Seul l'enseignant peut déchiffrer
const decrypted = decryptRSA(encrypted, privateKey);
```

### Protection Anti-Plagiat

Chaque soumission inclut :
- Identité de l'étudiant chiffrée
- Timestamp unique
- Sel cryptographique

→ Même avec les mêmes réponses, les textes chiffrés sont différents

## 🧪 Tests

```bash
# Exécuter tous les tests
npx hardhat test

# Avec coverage
npx hardhat coverage

# Tests spécifiques
npx hardhat test test/SystemeGestionControles.test.js
```

## 🌐 Déploiement

### Réseau de Test Sepolia

```bash
# 1. Obtenir des ETH de test
# https://sepoliafaucet.com/

# 2. Configurer .env avec votre clé privée

# 3. Déployer
npx hardhat run scripts/deploy.js --network sepolia

# 4. Vérifier sur Etherscan
npx hardhat verify --network sepolia <ADRESSE_CONTRAT>
```

### Réseau de Test Mumbai (Polygon)

```bash
npx hardhat run scripts/deploy.js --network mumbai
```

## 📁 Structure du Projet

```
systeme-gestion-controles-blockchain/
├── contracts/
│   └── SystemeGestionControles.sol    # Smart contract principal
├── scripts/
│   ├── deploy.js                       # Script de déploiement
│   └── manage-users.js                 # Gestion des utilisateurs
├── test/
│   └── SystemeGestionControles.test.js # Tests unitaires
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Application React
│   │   └── utils/                      # Utilitaires
│   └── package.json
├── hardhat.config.js                   # Configuration Hardhat
├── .env.example                        # Exemple de configuration
├── package.json
└── README.md
```

## 📊 Fonctionnalités du Smart Contract

| Fonction | Description | Rôle requis |
|----------|-------------|-------------|
| `inscrireEnseignant()` | Inscrire un enseignant | Admin |
| `inscrireEtudiant()` | Inscrire un étudiant | Admin |
| `creerDevoir()` | Créer un nouveau devoir | Enseignant |
| `soumettreDevoir()` | Soumettre un devoir | Étudiant |
| `corrigerSoumission()` | Corriger et noter | Enseignant |
| `publierAnnonce()` | Publier une annonce | Tous |
| `obtenirDevoir()` | Consulter un devoir | Tous |
| `obtenirSoumission()` | Voir une soumission | Tous |

## 🎓 Objectifs Pédagogiques Atteints

- [x] Automatisation des tâches de gestion
- [x] Signature numérique des transactions
- [x] Vérification facile et rapide
- [x] Transparence totale
- [x] Immuabilité des données
- [x] Sécurité renforcée

## 🔧 Technologies Utilisées

### Backend
- **Solidity 0.8.19** : Langage de smart contracts
- **Hardhat** : Framework de développement
- **Ethers.js** : Interaction avec la blockchain
- **OpenZeppelin** : Bibliothèques de sécurité

### Frontend
- **React 18** : Framework JavaScript
- **Tailwind CSS** : Framework CSS utilitaire
- **Ethers.js v6** : Connexion wallet
- **MetaMask** : Wallet Ethereum

## 📝 Scripts Disponibles

```bash
# Compilation
npm run compile

# Tests
npm run test

# Déploiement
npm run deploy:local
npm run deploy:sepolia
npm run deploy:mumbai

# Nœud local
npm run node

# Gestion utilisateurs
npm run manage

# Nettoyage
npm run clean
```

## 🐛 Dépannage

### MetaMask ne se connecte pas

1. Vérifier que MetaMask est installé
2. Ajouter le réseau local Hardhat :
   - URL RPC : `http://127.0.0.1:8545`
   - Chain ID : `31337`

### Transaction échoue

1. Vérifier la balance du compte
2. S'assurer d'avoir le bon rôle (enseignant/étudiant)
3. Vérifier les dates limites des devoirs

### Contrat non trouvé

1. Vérifier que le contrat est déployé
2. Mettre à jour l'adresse dans le frontend
3. Vérifier le réseau actif dans MetaMask

## 🤝 Contribution

Ce projet est réalisé dans le cadre du module M356 - Fondamentaux de la Blockchain.

**Auteurs :** [Noms des étudiants du groupe]  
**Professeur :** Imad Sassi  
**Institution :** ENSA Tétouan

## 📅 Calendrier

- **Date limite :** Lundi 15 Décembre 2025
- **Durée de présentation :** 20 minutes
  - 12 minutes : Présentation
  - 8 minutes : Questions

## 📧 Contact

**Email :** i.sassi@uae.ac.ma

## 📄 Licence

MIT © 2025 ENSA Tétouan

---

<div align="center">

**Fait avec ❤️ pour l'éducation décentralisée**

[Documentation](./DOCUMENTATION.md) • [Rapport](./rapport.pdf) • [Présentation](./presentation.pdf)

</div>