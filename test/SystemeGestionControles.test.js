const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SystemeGestionControles", function () {
  let systeme;
  let admin, enseignant1, enseignant2, etudiant1, etudiant2, nonInscrit;

  beforeEach(async function () {
    // Récupérer les signers
    [admin, enseignant1, enseignant2, etudiant1, etudiant2, nonInscrit] =
      await ethers.getSigners();

    // Déployer le contrat
    const SystemeGestionControles = await ethers.getContractFactory("SystemeGestionControles");
    systeme = await SystemeGestionControles.deploy();
  });

  // =====================================================
  //   DEPLOIEMENT
  // =====================================================
  describe("Déploiement", function () {
    it("Devrait définir le bon administrateur", async function () {
      expect(await systeme.administrateur()).to.equal(admin.address);
    });

    it("Devrait initialiser les compteurs à zéro", async function () {
      expect(await systeme.compteurDevoirs()).to.equal(0);
      expect(await systeme.compteurSoumissions()).to.equal(0);
      expect(await systeme.compteurAnnonces()).to.equal(0);
    });
  });

  // =====================================================
  //   GESTION DES ENSEIGNANTS
  // =====================================================
  describe("Gestion des Enseignants", function () {
    it("Devrait permettre à l'admin d'inscrire un enseignant", async function () {
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );

      const enseignant = await systeme.enseignants(enseignant1.address);
      expect(enseignant.nom).to.equal("Prof. Ahmed");
      expect(enseignant.clePublique).to.equal("PUBLIC_KEY_123");
      expect(enseignant.estActif).to.be.true;
    });

    it("Devrait émettre un événement lors de l'inscription", async function () {
      await expect(
        systeme.inscrireEnseignant(
          enseignant1.address,
          "Prof. Ahmed",
          "PUBLIC_KEY_123"
        )
      ).to.emit(systeme, "EnseignantInscrit")
        .withArgs(enseignant1.address, "Prof. Ahmed");
    });

    it("Ne devrait pas permettre à un non-admin d'inscrire un enseignant", async function () {
      await expect(
        systeme.connect(nonInscrit).inscrireEnseignant(
          enseignant1.address,
          "Prof. Ahmed",
          "PUBLIC_KEY_123"
        )
      ).to.be.revertedWith("Seul l'administrateur peut executer cette action");
    });

    it("Ne devrait pas permettre d'inscrire deux fois le même enseignant", async function () {
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );

      await expect(
        systeme.inscrireEnseignant(
          enseignant1.address,
          "Prof. Ahmed Bis",
          "PUBLIC_KEY_456"
        )
      ).to.be.revertedWith("Enseignant deja inscrit");
    });

    it("Devrait retourner true pour estEnseignant", async function () {
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );

      expect(await systeme.estEnseignant(enseignant1.address)).to.be.true;
      expect(await systeme.estEnseignant(etudiant1.address)).to.be.false;
    });
  });

  // =====================================================
  //   GESTION DES ETUDIANTS
  // =====================================================
  describe("Gestion des Étudiants", function () {
    it("Devrait permettre à l'admin d'inscrire un étudiant", async function () {
      await systeme.inscrireEtudiant(
        etudiant1.address,
        "Ahmed Benali",
        "BDIA2025001"
      );

      const etudiant = await systeme.etudiants(etudiant1.address);
      expect(etudiant.nom).to.equal("Ahmed Benali");
      expect(etudiant.numeroEtudiant).to.equal("BDIA2025001");
      expect(etudiant.estActif).to.be.true;
    });

    it("Devrait émettre un événement lors de l'inscription", async function () {
      await expect(
        systeme.inscrireEtudiant(
          etudiant1.address,
          "Ahmed Benali",
          "BDIA2025001"
        )
      ).to.emit(systeme, "EtudiantInscrit")
        .withArgs(etudiant1.address, "Ahmed Benali", "BDIA2025001");
    });

    it("Ne devrait pas permettre à un non-admin d'inscrire un étudiant", async function () {
      await expect(
        systeme.connect(nonInscrit).inscrireEtudiant(
          etudiant1.address,
          "Ahmed Benali",
          "BDIA2025001"
        )
      ).to.be.revertedWith("Seul l'administrateur peut executer cette action");
    });

    it("Devrait retourner true pour estEtudiant", async function () {
      await systeme.inscrireEtudiant(
        etudiant1.address,
        "Ahmed Benali",
        "BDIA2025001"
      );

      expect(await systeme.estEtudiant(etudiant1.address)).to.be.true;
      expect(await systeme.estEtudiant(enseignant1.address)).to.be.false;
    });
  });

  // =====================================================
  //   GESTION DES DEVOIRS
  // =====================================================
  describe("Gestion des Devoirs", function () {
    beforeEach(async function () {
      // Inscrire un enseignant
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );
    });

    it("Devrait permettre à un enseignant de créer un devoir", async function () {
      const dateLimite = Math.floor(Date.now() / 1000) + 86400; // +24h

      await systeme.connect(enseignant1).creerDevoir(
        "Contrôle Blockchain",
        "Questions sur les smart contracts",
        "PUBLIC_KEY_DEVOIR",
        dateLimite
      );

      expect(await systeme.compteurDevoirs()).to.equal(1);

      const devoir = await systeme.obtenirDevoir(1);
      expect(devoir.titre).to.equal("Contrôle Blockchain");
      expect(devoir.enseignant).to.equal(enseignant1.address);
      expect(devoir.estActif).to.be.true;
    });

    it("Devrait émettre un événement lors de la création", async function () {
      const dateLimite = Math.floor(Date.now() / 1000) + 86400;

      await expect(
        systeme.connect(enseignant1).creerDevoir(
          "Contrôle Blockchain",
          "Questions sur les smart contracts",
          "PUBLIC_KEY_DEVOIR",
          dateLimite
        )
      ).to.emit(systeme, "DevoirCree")
        .withArgs(1, enseignant1.address, "Contrôle Blockchain");
    });

    it("Ne devrait pas permettre à un non-enseignant de créer un devoir", async function () {
      const dateLimite = Math.floor(Date.now() / 1000) + 86400;

      await expect(
        systeme.connect(nonInscrit).creerDevoir(
          "Contrôle Blockchain",
          "Questions",
          "PUBLIC_KEY",
          dateLimite
        )
      ).to.be.revertedWith("Seul un enseignant peut executer cette action");
    });

    it("Ne devrait pas accepter une date limite passée", async function () {
      const datePassee = Math.floor(Date.now() / 1000) - 3600; // -1h

      await expect(
        systeme.connect(enseignant1).creerDevoir(
          "Contrôle Blockchain",
          "Questions",
          "PUBLIC_KEY",
          datePassee
        )
      ).to.be.revertedWith("La date limite doit etre dans le futur");
    });

    it("Devrait retourner la liste de tous les devoirs", async function () {
      const dateLimite = Math.floor(Date.now() / 1000) + 86400;

      await systeme.connect(enseignant1).creerDevoir(
        "Devoir 1",
        "Description 1",
        "KEY1",
        dateLimite
      );

      await systeme.connect(enseignant1).creerDevoir(
        "Devoir 2",
        "Description 2",
        "KEY2",
        dateLimite
      );

      const devoirs = await systeme.obtenirTousLesDevoirs();
      expect(devoirs.length).to.equal(2);
    });
  });

  // =====================================================
  //   GESTION DES SOUMISSIONS
  // =====================================================
  describe("Gestion des Soumissions", function () {
    let devoirId;
    let dateLimite;

    beforeEach(async function () {
      // Inscrire enseignant et étudiant
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );

      await systeme.inscrireEtudiant(
        etudiant1.address,
        "Ahmed Benali",
        "BDIA2025001"
      );

      // Créer un devoir avec le temps on-chain
      const now = await time.latest();
      dateLimite = Number(now) + 86400;

      await systeme.connect(enseignant1).creerDevoir(
        "Contrôle Blockchain",
        "Questions sur les smart contracts",
        "PUBLIC_KEY_DEVOIR",
        dateLimite
      );

      devoirId = 1;
    });

    it("Devrait permettre à un étudiant de soumettre un devoir", async function () {
      await systeme.connect(etudiant1).soumettreDevoir(
        devoirId,
        "CONTENU_CHIFFRE_ABC",
        "IDENTITE_CHIFFREE_123"
      );

      expect(await systeme.compteurSoumissions()).to.equal(1);

      const soumission = await systeme.obtenirSoumission(1);
      expect(soumission.etudiant).to.equal(etudiant1.address);
      expect(soumission.devoirId).to.equal(devoirId);
      expect(soumission.contenuChiffre).to.equal("CONTENU_CHIFFRE_ABC");
    });

    it("Devrait émettre un événement lors de la soumission", async function () {
      await expect(
        systeme.connect(etudiant1).soumettreDevoir(
          devoirId,
          "CONTENU_CHIFFRE_ABC",
          "IDENTITE_CHIFFREE_123"
        )
      ).to.emit(systeme, "SoumissionEnvoyee")
        .withArgs(1, devoirId, etudiant1.address);
    });

    it("Ne devrait pas permettre à un non-étudiant de soumettre", async function () {
      await expect(
        systeme.connect(nonInscrit).soumettreDevoir(
          devoirId,
          "CONTENU_CHIFFRE_ABC",
          "IDENTITE_CHIFFREE_123"
        )
      ).to.be.revertedWith("Seul un etudiant peut executer cette action");
    });

    it("Ne devrait pas accepter de soumission après la date limite", async function () {
      // Avancer le temps au-delà de la date limite
      await time.increaseTo(dateLimite + 3600);

      await expect(
        systeme.connect(etudiant1).soumettreDevoir(
          devoirId,
          "CONTENU_CHIFFRE_ABC",
          "IDENTITE_CHIFFREE_123"
        )
      ).to.be.revertedWith("La date limite est depassee");
    });

    it("Devrait stocker les soumissions par devoir", async function () {
      await systeme.inscrireEtudiant(
        etudiant2.address,
        "Fatima Zahra",
        "BDIA2025002"
      );

      await systeme.connect(etudiant1).soumettreDevoir(
        devoirId,
        "CONTENU1",
        "IDENTITE1"
      );

      await systeme.connect(etudiant2).soumettreDevoir(
        devoirId,
        "CONTENU2",
        "IDENTITE2"
      );

      const soumissions = await systeme.obtenirSoumissionsDevoir(devoirId);
      expect(soumissions.length).to.equal(2);
    });

    it("Devrait stocker les soumissions par étudiant", async function () {
      // On ajoute un deuxième enseignant
      await systeme.inscrireEnseignant(
        enseignant2.address,
        "Prof. Fatima",
        "PUBLIC_KEY_456"
      );

      // On récupère le temps on-chain actuel
      const now2 = await time.latest();
      const dateLimite2 = Number(now2) + 86400;

      // Création du deuxième devoir par le deuxième enseignant
      await systeme.connect(enseignant2).creerDevoir(
        "Devoir 2",
        "Description 2",
        "KEY2",
        dateLimite2
      );

      // L'étudiant soumet pour les deux devoirs
      await systeme.connect(etudiant1).soumettreDevoir(
        devoirId,
        "CONTENU1",
        "IDENTITE1"
      );

      await systeme.connect(etudiant1).soumettreDevoir(
        2,
        "CONTENU2",
        "IDENTITE2"
      );

      const soumissions = await systeme.obtenirSoumissionsEtudiant(etudiant1.address);
      expect(soumissions.length).to.equal(2);
    });
  });

  // =====================================================
  //   CORRECTION DES SOUMISSIONS
  // =====================================================
  describe("Correction des Soumissions", function () {
    let devoirId, soumissionId;

    beforeEach(async function () {
      // Setup complet
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );

      await systeme.inscrireEtudiant(
        etudiant1.address,
        "Ahmed Benali",
        "BDIA2025001"
      );

      const now = await time.latest();
      const dateLimite = Number(now) + 86400;

      await systeme.connect(enseignant1).creerDevoir(
        "Contrôle Blockchain",
        "Questions",
        "PUBLIC_KEY_DEVOIR",
        dateLimite
      );

      devoirId = 1;

      await systeme.connect(etudiant1).soumettreDevoir(
        devoirId,
        "CONTENU_CHIFFRE",
        "IDENTITE_CHIFFREE"
      );

      soumissionId = 1;
    });

    it("Devrait permettre à l'enseignant de corriger", async function () {
      await systeme.connect(enseignant1).corrigerSoumission(
        soumissionId,
        85,
        "Excellent travail!"
      );

      const soumission = await systeme.obtenirSoumission(soumissionId);
      expect(soumission.estCorrige).to.be.true;
      expect(soumission.note).to.equal(85);
      expect(soumission.commentaire).to.equal("Excellent travail!");
    });

    it("Devrait émettre un événement lors de la correction", async function () {
      await expect(
        systeme.connect(enseignant1).corrigerSoumission(
          soumissionId,
          85,
          "Excellent travail!"
        )
      ).to.emit(systeme, "SoumissionCorrigee")
        .withArgs(soumissionId, 85);
    });

    it("Ne devrait pas permettre à un autre enseignant de corriger", async function () {
      await systeme.inscrireEnseignant(
        enseignant2.address,
        "Prof. Fatima",
        "PUBLIC_KEY_456"
      );

      await expect(
        systeme.connect(enseignant2).corrigerSoumission(
          soumissionId,
          85,
          "Commentaire"
        )
      ).to.be.revertedWith("Vous n'etes pas l'enseignant de ce devoir");
    });

    it("Ne devrait pas permettre à un non-enseignant de corriger", async function () {
      await expect(
        systeme.connect(etudiant1).corrigerSoumission(
          soumissionId,
          85,
          "Commentaire"
        )
      ).to.be.revertedWith("Seul un enseignant peut executer cette action");
    });
  });

  // =====================================================
  //   GESTION DES ANNONCES
  // =====================================================
  describe("Gestion des Annonces", function () {
    beforeEach(async function () {
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );

      await systeme.inscrireEtudiant(
        etudiant1.address,
        "Ahmed Benali",
        "BDIA2025001"
      );
    });

    it("Devrait permettre à un enseignant de publier une annonce", async function () {
      await systeme.connect(enseignant1).publierAnnonce(
        "Annonce importante",
        "Le cours de demain est annulé",
        true
      );

      expect(await systeme.compteurAnnonces()).to.equal(1);

      const annonce = await systeme.annonces(1);
      expect(annonce.titre).to.equal("Annonce importante");
      expect(annonce.auteur).to.equal(enseignant1.address);
      expect(annonce.estPublique).to.be.true;
    });

    it("Devrait permettre à un étudiant de publier une annonce", async function () {
      await systeme.connect(etudiant1).publierAnnonce(
        "Question",
        "Où trouver les ressources?",
        true
      );

      expect(await systeme.compteurAnnonces()).to.equal(1);
    });

    it("Ne devrait pas permettre à un non-inscrit de publier", async function () {
      await expect(
        systeme.connect(nonInscrit).publierAnnonce(
          "Titre",
          "Contenu",
          true
        )
      ).to.be.revertedWith("Seuls les membres inscrits peuvent publier");
    });

    it("Devrait émettre un événement lors de la publication", async function () {
      await expect(
        systeme.connect(enseignant1).publierAnnonce(
          "Annonce",
          "Contenu",
          true
        )
      ).to.emit(systeme, "AnnoncePubliee")
        .withArgs(1, enseignant1.address, "Annonce");
    });
  });

  // =====================================================
  //   INTEGRATION COMPLETE
  // =====================================================
  describe("Intégration Complète", function () {
    it("Devrait gérer un flux complet d'utilisation", async function () {
      // 1. Admin inscrit un enseignant et un étudiant
      await systeme.inscrireEnseignant(
        enseignant1.address,
        "Prof. Ahmed",
        "PUBLIC_KEY_123"
      );

      await systeme.inscrireEtudiant(
        etudiant1.address,
        "Ahmed Benali",
        "BDIA2025001"
      );

      // 2. Enseignant crée un devoir avec le temps on-chain
      const now = await time.latest();
      const dateLimite = Number(now) + 86400;

      await systeme.connect(enseignant1).creerDevoir(
        "Contrôle Final",
        "Questions sur blockchain",
        "PUBLIC_KEY_DEVOIR",
        dateLimite
      );

      // 3. Étudiant soumet le devoir
      await systeme.connect(etudiant1).soumettreDevoir(
        1,
        "REPONSES_CHIFFREES",
        "IDENTITE_CHIFFREE"
      );

      // 4. Enseignant corrige
      await systeme.connect(enseignant1).corrigerSoumission(
        1,
        90,
        "Très bon travail!"
      );

      // 5. Vérifications finales
      const soumission = await systeme.obtenirSoumission(1);
      expect(soumission.estCorrige).to.be.true;
      expect(soumission.note).to.equal(90);

      const compteurs = {
        devoirs: await systeme.compteurDevoirs(),
        soumissions: await systeme.compteurSoumissions()
      };

      expect(compteurs.devoirs).to.equal(1);
      expect(compteurs.soumissions).to.equal(1);
    });
  });
});
