const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SystemeGestionControles", function () {
  let systeme;
  let admin, enseignant1, enseignant2, etudiant1, etudiant2, nonInscrit;

  async function deployFresh() {
    const SystemeGestionControles = await ethers.getContractFactory("SystemeGestionControles");
    const c = await SystemeGestionControles.deploy();
    return c;
  }

  async function setupProfEtudiants() {
    await systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed");
    await systeme.inscrireEnseignant(enseignant2.address, "Prof. Fatima");

    await systeme.inscrireEtudiant(etudiant1.address, "Ahmed Benali", "BDIA2025001");
    await systeme.inscrireEtudiant(etudiant2.address, "Fatima Zahra", "BDIA2025002");
  }

  async function setupModule1WithProf1() {
    await systeme.creerModule("Blockchain", 2, enseignant1.address);
  }

  async function setupModule2WithProf2() {
    await systeme.creerModule("IA", 3, enseignant2.address);
  }

  async function createDevoir(moduleId, profSigner, titre = "Devoir", desc = "Desc") {
    const now = await time.latest();
    const dateLimite = Number(now) + 86400;
    await systeme.connect(profSigner).creerDevoir(
      moduleId,
      titre,
      desc,
      "PUB_KEY_DEVOIR",
      dateLimite
    );
    return { devoirId: await systeme.compteurDevoirs(), dateLimite };
  }

  async function submit(devoirId, etuSigner, payload = {}) {
    const args = {
      contenu: payload.contenu ?? "CONTENU_CHIFFRE",
      identite: payload.identite ?? "IDENTITE_CHIFFREE",
      hash: payload.hash ?? "HASH_FILE",
      nom: payload.nom ?? "soumission.pdf",
      type: payload.type ?? "application/pdf",
      uri: payload.uri ?? "ipfs://cid",
      aes: payload.aes ?? "AES_KEY_CHIFFREE",
    };

    await systeme.connect(etuSigner).soumettreDevoir(
      devoirId,
      args.contenu,
      args.identite,
      args.hash,
      args.nom,
      args.type,
      args.uri,
      args.aes
    );
    return await systeme.compteurSoumissions();
  }

  beforeEach(async function () {
    [admin, enseignant1, enseignant2, etudiant1, etudiant2, nonInscrit] =
      await ethers.getSigners();
    systeme = await deployFresh();
  });

  // =====================================================
  // DEPLOIEMENT
  // =====================================================
  describe("Déploiement", function () {
    it("Admin = deployer", async function () {
      expect(await systeme.administrateur()).to.equal(admin.address);
    });

    it("Compteurs init à 0", async function () {
      expect(await systeme.compteurModules()).to.equal(0);
      expect(await systeme.compteurDevoirs()).to.equal(0);
      expect(await systeme.compteurSoumissions()).to.equal(0);
      expect(await systeme.compteurAnnonces()).to.equal(0);
    });
  });

  // =====================================================
  // INSCRIPTIONS
  // =====================================================
  describe("Inscriptions (Admin)", function () {
    it("Admin inscrit enseignant (sans clé)", async function () {
      await systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed");
      const prof = await systeme.enseignants(enseignant1.address);
      expect(prof.nom).to.equal("Prof. Ahmed");
      expect(prof.clePublique).to.equal("");
      expect(prof.estActif).to.equal(true);
      expect(prof.moduleId).to.equal(0);
      expect(prof.dateInscription).to.be.gt(0);
    });

    it("Event EnseignantInscrit(moduleId=0)", async function () {
      await expect(systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed"))
        .to.emit(systeme, "EnseignantInscrit")
        .withArgs(enseignant1.address, "Prof. Ahmed", 0);
    });

    it("Revert si adresse 0 enseignant", async function () {
      await expect(
        systeme.inscrireEnseignant(ethers.ZeroAddress, "Prof")
      ).to.be.revertedWith("Adresse invalide");
    });

    it("Revert si enseignant déjà inscrit", async function () {
      await systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed");
      await expect(
        systeme.inscrireEnseignant(enseignant1.address, "Prof X")
      ).to.be.revertedWith("Enseignant deja inscrit");
    });

    it("Non-admin ne peut pas inscrire enseignant", async function () {
      await expect(
        systeme.connect(nonInscrit).inscrireEnseignant(enseignant1.address, "Prof")
      ).to.be.revertedWith("Seul l'administrateur peut executer cette action");
    });

    it("Admin inscrit étudiant (sans clé RSA)", async function () {
      await systeme.inscrireEtudiant(etudiant1.address, "Ahmed", "BDIA2025001");
      const etu = await systeme.etudiants(etudiant1.address);
      expect(etu.nom).to.equal("Ahmed");
      expect(etu.numeroEtudiant).to.equal("BDIA2025001");
      
      expect(etu.estActif).to.equal(true);
      expect(etu.dateInscription).to.be.gt(0);
    });

    it("Event EtudiantInscrit", async function () {
      await expect(systeme.inscrireEtudiant(etudiant1.address, "Ahmed", "BDIA2025001"))
        .to.emit(systeme, "EtudiantInscrit")
        .withArgs(etudiant1.address, "Ahmed", "BDIA2025001");
    });

    it("Revert si adresse 0 étudiant", async function () {
      await expect(
        systeme.inscrireEtudiant(ethers.ZeroAddress, "Etu", "X")
      ).to.be.revertedWith("Adresse invalide");
    });

    it("Revert si étudiant déjà inscrit", async function () {
      await systeme.inscrireEtudiant(etudiant1.address, "Ahmed", "BDIA2025001");
      await expect(
        systeme.inscrireEtudiant(etudiant1.address, "Ahmed2", "BDIA2")
      ).to.be.revertedWith("Etudiant deja inscrit");
    });

    it("Non-admin ne peut pas inscrire étudiant", async function () {
      await expect(
        systeme.connect(nonInscrit).inscrireEtudiant(etudiant1.address, "Ahmed", "BDIA2025001")
      ).to.be.revertedWith("Seul l'administrateur peut executer cette action");
    });

    it("estEnseignant / estEtudiant", async function () {
      await systeme.inscrireEnseignant(enseignant1.address, "Prof");
      await systeme.inscrireEtudiant(etudiant1.address, "Etu", "N1");
      expect(await systeme.estEnseignant(enseignant1.address)).to.equal(true);
      expect(await systeme.estEnseignant(etudiant1.address)).to.equal(false);
      expect(await systeme.estEtudiant(etudiant1.address)).to.equal(true);
      expect(await systeme.estEtudiant(enseignant1.address)).to.equal(false);
    });
  });

  // =====================================================
  // CLE PUBLIQUE PROF (SELF-SERVICE)
  // =====================================================
  describe("Clé publique prof (Self-service)", function () {
    beforeEach(async function () {
      await systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed");
      await systeme.inscrireEtudiant(etudiant1.address, "Ahmed", "BDIA2025001");
    });

    it("Enseignant définit clé (ok + event)", async function () {
      await expect(systeme.connect(enseignant1).definirClePubliqueEnseignant("RSA_PROF"))
        .to.emit(systeme, "ClePubliqueEnseignantMiseAJour")
        .withArgs(enseignant1.address);

      const prof = await systeme.enseignants(enseignant1.address);
      expect(prof.clePublique).to.equal("RSA_PROF");
    });

    it("Revert clé vide enseignant", async function () {
      await expect(
        systeme.connect(enseignant1).definirClePubliqueEnseignant("")
      ).to.be.revertedWith("Cle publique vide");
    });

    it("Non-enseignant ne peut pas définir clé enseignant", async function () {
      await expect(
        systeme.connect(etudiant1).definirClePubliqueEnseignant("X")
      ).to.be.revertedWith("Seul un enseignant peut executer cette action");
    });

  });

  // =====================================================
  // MODULES
  // =====================================================
  describe("Modules (Admin)", function () {
    beforeEach(async function () {
      await systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed");
      await systeme.inscrireEnseignant(enseignant2.address, "Prof. Fatima");
    });

    it("Créer module OK + event + module attaché au prof", async function () {
      await expect(systeme.creerModule("Blockchain", 2, enseignant1.address))
        .to.emit(systeme, "ModuleCree")
        .withArgs(1, "Blockchain", 2, enseignant1.address);

      expect(await systeme.compteurModules()).to.equal(1);

      const m = await systeme.modules(1);
      expect(m.id).to.equal(1);
      expect(m.nom).to.equal("Blockchain");
      expect(m.coefficient).to.equal(2);
      expect(m.enseignant).to.equal(enseignant1.address);
      expect(m.estActif).to.equal(true);

      const prof = await systeme.enseignants(enseignant1.address);
      expect(prof.moduleId).to.equal(1);
    });

    it("Revert si coefficient invalide", async function () {
      await expect(
        systeme.creerModule("X", 0, enseignant1.address)
      ).to.be.revertedWith("Coefficient invalide");
    });

    it("Revert si adresse enseignant invalide", async function () {
      await expect(
        systeme.creerModule("X", 1, ethers.ZeroAddress)
      ).to.be.revertedWith("Adresse enseignant invalide");
    });

    it("Revert si enseignant non actif", async function () {
      await expect(
        systeme.creerModule("X", 1, nonInscrit.address)
      ).to.be.revertedWith("Enseignant non actif");
    });

    it("Revert si prof a déjà un module", async function () {
      await systeme.creerModule("Blockchain", 2, enseignant1.address);
      await expect(
        systeme.creerModule("IA", 3, enseignant1.address)
      ).to.be.revertedWith("Ce prof a deja un module");
    });

    it("Non-admin ne peut pas créer module", async function () {
      await expect(
        systeme.connect(nonInscrit).creerModule("X", 1, enseignant1.address)
      ).to.be.revertedWith("Seul l'administrateur peut executer cette action");
    });

    it("obtenirModules retourne la liste", async function () {
      await systeme.creerModule("Blockchain", 2, enseignant1.address);
      await systeme.creerModule("IA", 3, enseignant2.address);

      const arr = await systeme.obtenirModules();
      expect(arr.length).to.equal(2);
      expect(arr[0].id).to.equal(1);
      expect(arr[1].id).to.equal(2);
    });
  });

  // =====================================================
  // AFFECTATION ETUDIANTS -> MODULE
  // =====================================================
  describe("Affectation étudiants aux modules (Admin)", function () {
    beforeEach(async function () {
      await setupProfEtudiants();
      await setupModule1WithProf1(); // module 1
      await setupModule2WithProf2(); // module 2
    });

    it("Affecter étudiant -> module OK + event + lecture", async function () {
      await expect(systeme.affecterEtudiantAuModule(1, etudiant1.address))
        .to.emit(systeme, "EtudiantAffecteModule")
        .withArgs(1, etudiant1.address);

      expect(await systeme.estInscritDansModule(1, etudiant1.address)).to.equal(true);

      const list = await systeme.obtenirEtudiantsModule(1);
      expect(list.length).to.equal(1);
      expect(list[0]).to.equal(etudiant1.address);
    });

    it("Revert si module inexistant", async function () {
      await expect(
        systeme.affecterEtudiantAuModule(999, etudiant1.address)
      ).to.be.revertedWith("Module inexistant");
    });

    it("Revert si adresse etudiant invalide", async function () {
      await expect(
        systeme.affecterEtudiantAuModule(1, ethers.ZeroAddress)
      ).to.be.revertedWith("Adresse etudiant invalide");
    });

    it("Revert si étudiant non actif", async function () {
      await expect(
        systeme.affecterEtudiantAuModule(1, nonInscrit.address)
      ).to.be.revertedWith("Etudiant non actif");
    });

    it("Revert si déjà inscrit", async function () {
      await systeme.affecterEtudiantAuModule(1, etudiant1.address);
      await expect(
        systeme.affecterEtudiantAuModule(1, etudiant1.address)
      ).to.be.revertedWith("Deja inscrit au module");
    });

    it("Non-admin ne peut pas affecter", async function () {
      await expect(
        systeme.connect(nonInscrit).affecterEtudiantAuModule(1, etudiant1.address)
      ).to.be.revertedWith("Seul l'administrateur peut executer cette action");
    });

    it("Un étudiant peut être affecté à plusieurs modules", async function () {
      await systeme.affecterEtudiantAuModule(1, etudiant1.address);
      await systeme.affecterEtudiantAuModule(2, etudiant1.address);

      expect(await systeme.estInscritDansModule(1, etudiant1.address)).to.equal(true);
      expect(await systeme.estInscritDansModule(2, etudiant1.address)).to.equal(true);
    });
  });

  // =====================================================
  // DEVOIRS
  // =====================================================
  describe("Devoirs (Enseignant)", function () {
    beforeEach(async function () {
      await setupProfEtudiants();
      await setupModule1WithProf1(); // module 1 prof1
      await setupModule2WithProf2(); // module 2 prof2
    });

    it("Créer devoir OK + event + champs", async function () {
      const now = await time.latest();
      const dateLimite = Number(now) + 86400;

      await expect(
        systeme.connect(enseignant1).creerDevoir(
          1,
          "Contrôle Blockchain",
          "Questions",
          "PUB_KEY_DEVOIR",
          dateLimite
        )
      )
        .to.emit(systeme, "DevoirCree")
        .withArgs(1, enseignant1.address, "Contrôle Blockchain", 1);

      expect(await systeme.compteurDevoirs()).to.equal(1);
      const d = await systeme.obtenirDevoir(1);
      expect(d.id).to.equal(1);
      expect(d.enseignant).to.equal(enseignant1.address);
      expect(d.moduleId).to.equal(1);
      expect(d.titre).to.equal("Contrôle Blockchain");
      expect(d.estActif).to.equal(true);
      expect(d.dateCreation).to.be.gt(0);
    });

    it("Revert si module inexistant", async function () {
      const now = await time.latest();
      const dateLimite = Number(now) + 86400;

      await expect(
        systeme.connect(enseignant1).creerDevoir(999, "T", "D", "K", dateLimite)
      ).to.be.revertedWith("Module inexistant");
    });

    it("Revert si date limite invalide", async function () {
      const now = await time.latest();
      await expect(
        systeme.connect(enseignant1).creerDevoir(1, "T", "D", "K", Number(now))
      ).to.be.revertedWith("Date limite invalide");
    });

    it("Revert si pas le prof du module", async function () {
      const now = await time.latest();
      const dateLimite = Number(now) + 86400;

      await expect(
        systeme.connect(enseignant1).creerDevoir(2, "T", "D", "K", dateLimite)
      ).to.be.revertedWith("Pas le prof de ce module");
    });

    it("Non-enseignant ne peut pas créer devoir", async function () {
      const now = await time.latest();
      const dateLimite = Number(now) + 86400;

      await expect(
        systeme.connect(nonInscrit).creerDevoir(1, "T", "D", "K", dateLimite)
      ).to.be.revertedWith("Seul un enseignant peut executer cette action");
    });

    it("obtenirTousLesDevoirs retourne IDs", async function () {
      await createDevoir(1, enseignant1, "D1");
      await createDevoir(1, enseignant1, "D2");
      const ids = await systeme.obtenirTousLesDevoirs();
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal(1);
      expect(ids[1]).to.equal(2);
    });

    it("obtenirDevoir d'un id non créé retourne id=0 (sans revert)", async function () {
      const d = await systeme.obtenirDevoir(999);
      expect(d.id).to.equal(0);
    });
  });

  // =====================================================
  // SOUMISSIONS
  // =====================================================
  describe("Soumissions (Etudiant)", function () {
    let devoirId, dateLimite;

    beforeEach(async function () {
      await setupProfEtudiants();
      await setupModule1WithProf1(); // module 1
      await systeme.affecterEtudiantAuModule(1, etudiant1.address);
      await systeme.affecterEtudiantAuModule(1, etudiant2.address);

      const res = await createDevoir(1, enseignant1, "Devoir Blockchain");
      devoirId = Number(res.devoirId);
      dateLimite = Number(res.dateLimite);
    });

    it("Soumettre OK + event + stockage + aDejaSoumis", async function () {
      await expect(
        systeme.connect(etudiant1).soumettreDevoir(
          devoirId,
          "CONTENU",
          "IDENTITE",
          "HASH",
          "a.pdf",
          "application/pdf",
          "ipfs://x",
          "AES"
        )
      )
        .to.emit(systeme, "SoumissionEnvoyee")
        .withArgs(1, devoirId, etudiant1.address);

      expect(await systeme.compteurSoumissions()).to.equal(1);

      const s = await systeme.obtenirSoumission(1);
      expect(s.id).to.equal(1);
      expect(s.devoirId).to.equal(devoirId);
      expect(s.moduleId).to.equal(1);
      expect(s.etudiant).to.equal(etudiant1.address);
      expect(s.contenuChiffre).to.equal("CONTENU");
      expect(s.identiteChiffree).to.equal("IDENTITE");
      expect(s.dateSubmission).to.be.gt(0);
      expect(s.estCorrige).to.equal(false);
      expect(s.note).to.equal(0);

      expect(s.fichier.hash).to.equal("HASH");
      expect(s.fichier.nom).to.equal("a.pdf");
      expect(s.fichier.fileType).to.equal("application/pdf");
      expect(s.fichier.uri).to.equal("ipfs://x");
      expect(s.fichier.cleAESChiffree).to.equal("AES");

      expect(await systeme.aDejaSoumis(devoirId, etudiant1.address)).to.equal(true);
    });

    it("Revert si devoir inexistant (devoirExiste)", async function () {
      await expect(
        systeme.connect(etudiant1).soumettreDevoir(
          999,
          "C",
          "I",
          "H",
          "a.pdf",
          "application/pdf",
          "uri",
          "AES"
        )
      ).to.be.revertedWith("Le devoir n'existe pas");
    });

    it("Revert si date limite dépassée", async function () {
      await time.increaseTo(dateLimite + 1);

      await expect(
        systeme.connect(etudiant1).soumettreDevoir(
          devoirId,
          "C",
          "I",
          "H",
          "a.pdf",
          "application/pdf",
          "uri",
          "AES"
        )
      ).to.be.revertedWith("Date limite depassee");
    });

    it("Revert si non-étudiant soumet", async function () {
      await expect(
        systeme.connect(nonInscrit).soumettreDevoir(
          devoirId,
          "C",
          "I",
          "H",
          "a.pdf",
          "application/pdf",
          "uri",
          "AES"
        )
      ).to.be.revertedWith("Seul un etudiant peut executer cette action");
    });

    it("Revert si étudiant pas inscrit au module du devoir", async function () {
      const [, , , , , outsider] = await ethers.getSigners();
      await systeme.inscrireEtudiant(outsider.address, "Out", "X");
      // outsider PAS affecté module 1

      await expect(
        systeme.connect(outsider).soumettreDevoir(
          devoirId,
          "C",
          "I",
          "H",
          "a.pdf",
          "application/pdf",
          "uri",
          "AES"
        )
      ).to.be.revertedWith("Pas inscrit dans ce module");
    });

    it("Revert si double soumission", async function () {
      await submit(devoirId, etudiant1);
      await expect(submit(devoirId, etudiant1)).to.be.revertedWith("Deja soumis");
    });

    it("Stockage soumissionsParDevoir", async function () {
      await submit(devoirId, etudiant1);
      await submit(devoirId, etudiant2);

      const ids = await systeme.obtenirSoumissionsDevoir(devoirId);
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal(1);
      expect(ids[1]).to.equal(2);
    });

    it("Stockage soumissionsParEtudiant", async function () {
      await submit(devoirId, etudiant1);
      await submit(devoirId, etudiant2);

      const ids1 = await systeme.obtenirSoumissionsEtudiant(etudiant1.address);
      expect(ids1.length).to.equal(1);
      expect(ids1[0]).to.equal(1);

      const ids2 = await systeme.obtenirSoumissionsEtudiant(etudiant2.address);
      expect(ids2.length).to.equal(1);
      expect(ids2[0]).to.equal(2);
    });

    it("Soumission contient fichierCorrection vide au début", async function () {
      await submit(devoirId, etudiant1);
      const s = await systeme.obtenirSoumission(1);
      expect(s.fichierCorrection.hash).to.equal("");
      expect(s.fichierCorrection.nom).to.equal("");
      expect(s.fichierCorrection.uri).to.equal("");
    });
  });

  // =====================================================
  // CORRECTIONS
  // =====================================================
  describe("Corrections (Enseignant)", function () {
    let devoirId, soumissionId;

    beforeEach(async function () {
      await setupProfEtudiants();
      await setupModule1WithProf1(); // module 1
      await setupModule2WithProf2(); // module 2

      await systeme.affecterEtudiantAuModule(1, etudiant1.address);

      const res = await createDevoir(1, enseignant1, "Devoir");
      devoirId = Number(res.devoirId);

      await submit(devoirId, etudiant1);
      soumissionId = 1;
    });

    it("Corriger OK (note <=20) + event + fichier correction", async function () {
      await expect(
        systeme.connect(enseignant1).corrigerSoumission(
          soumissionId,
          20,
          "Parfait",
          "H_CORR",
          "corr.pdf",
          "uri-corr"
        )
      )
        .to.emit(systeme, "SoumissionCorrigee")
        .withArgs(soumissionId, 20);

      const s = await systeme.obtenirSoumission(soumissionId);
      expect(s.estCorrige).to.equal(true);
      expect(s.note).to.equal(20);
      expect(s.commentaire).to.equal("Parfait");
      expect(s.fichierCorrection.hash).to.equal("H_CORR");
      expect(s.fichierCorrection.nom).to.equal("corr.pdf");
      expect(s.fichierCorrection.uri).to.equal("uri-corr");
    });

    it("Note 0 acceptée", async function () {
      await systeme.connect(enseignant1).corrigerSoumission(
        soumissionId,
        0,
        "0/20",
        "H",
        "c.pdf",
        "uri"
      );
      const s = await systeme.obtenirSoumission(soumissionId);
      expect(s.note).to.equal(0);
      expect(s.estCorrige).to.equal(true);
    });

    it("Revert si note > 20", async function () {
      await expect(
        systeme.connect(enseignant1).corrigerSoumission(
          soumissionId,
          21,
          "Bad",
          "H",
          "c.pdf",
          "uri"
        )
      ).to.be.revertedWith("Note invalide (0..20)");
    });

    it("Revert si soumission inexistante", async function () {
      await expect(
        systeme.connect(enseignant1).corrigerSoumission(
          999,
          10,
          "X",
          "H",
          "c.pdf",
          "uri"
        )
      ).to.be.revertedWith("Soumission inexistante");
    });

    it("Revert si autre enseignant corrige", async function () {
      await expect(
        systeme.connect(enseignant2).corrigerSoumission(
          soumissionId,
          10,
          "X",
          "H",
          "c.pdf",
          "uri"
        )
      ).to.be.revertedWith("Pas l'enseignant de ce devoir");
    });

    it("Revert si non-enseignant corrige", async function () {
      await expect(
        systeme.connect(etudiant1).corrigerSoumission(
          soumissionId,
          10,
          "X",
          "H",
          "c.pdf",
          "uri"
        )
      ).to.be.revertedWith("Seul un enseignant peut executer cette action");
    });
  });

  // =====================================================
  // OBTENIR NOTES ETUDIANT
  // =====================================================
  describe("obtenirNotesEtudiant()", function () {
    beforeEach(async function () {
      await setupProfEtudiants();
      await setupModule1WithProf1(); // module 1
      await setupModule2WithProf2(); // module 2

      // etudiant1 dans les 2 modules
      await systeme.affecterEtudiantAuModule(1, etudiant1.address);
      await systeme.affecterEtudiantAuModule(2, etudiant1.address);

      await createDevoir(1, enseignant1, "D1");
      await createDevoir(2, enseignant2, "D2");

      await submit(1, etudiant1, { hash: "H1", nom: "d1.pdf" });
      await submit(2, etudiant1, { hash: "H2", nom: "d2.pdf" });

      await systeme.connect(enseignant1).corrigerSoumission(1, 14, "ok", "HC1", "c1.pdf", "u1");
      await systeme.connect(enseignant2).corrigerSoumission(2, 18, "bien", "HC2", "c2.pdf", "u2");
    });

    it("Retourne (soumissionIds, notes, moduleIds) cohérents", async function () {
      const res = await systeme.obtenirNotesEtudiant(etudiant1.address);
      const soumissionIds = res[0];
      const notes = res[1];
      const moduleIds = res[2];

      expect(soumissionIds.length).to.equal(2);
      expect(notes.length).to.equal(2);
      expect(moduleIds.length).to.equal(2);

      expect(soumissionIds[0]).to.equal(1);
      expect(notes[0]).to.equal(14);
      expect(moduleIds[0]).to.equal(1);

      expect(soumissionIds[1]).to.equal(2);
      expect(notes[1]).to.equal(18);
      expect(moduleIds[1]).to.equal(2);
    });

    it("Si étudiant n'a aucune soumission => tableaux vides", async function () {
      const res2 = await systeme.obtenirNotesEtudiant(etudiant2.address);
      expect(res2[0].length).to.equal(0);
      expect(res2[1].length).to.equal(0);
      expect(res2[2].length).to.equal(0);
    });
  });

  // =====================================================
  // ANNONCES
  // =====================================================
  describe("Annonces", function () {
    beforeEach(async function () {
      await systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed");
      await systeme.inscrireEtudiant(etudiant1.address, "Ahmed", "BDIA2025001");
    });

    it("Prof publie annonce OK + event", async function () {
      await expect(
        systeme.connect(enseignant1).publierAnnonce("Annonce", "Contenu", true)
      )
        .to.emit(systeme, "AnnoncePubliee")
        .withArgs(1, enseignant1.address, "Annonce");

      expect(await systeme.compteurAnnonces()).to.equal(1);
      const a = await systeme.annonces(1);
      expect(a.id).to.equal(1);
      expect(a.auteur).to.equal(enseignant1.address);
      expect(a.titre).to.equal("Annonce");
      expect(a.contenu).to.equal("Contenu");
      expect(a.estPublique).to.equal(true);
      expect(a.dateCreation).to.be.gt(0);
    });

    it("Etudiant publie annonce OK", async function () {
      await systeme.connect(etudiant1).publierAnnonce("Q", "???", false);
      expect(await systeme.compteurAnnonces()).to.equal(1);
      const a = await systeme.annonces(1);
      expect(a.estPublique).to.equal(false);
    });

    it("Non-inscrit ne peut pas publier", async function () {
      await expect(
        systeme.connect(nonInscrit).publierAnnonce("T", "C", true)
      ).to.be.revertedWith("Seuls les membres inscrits peuvent publier");
    });
  });

  // =====================================================
  // INTEGRATION COMPLETE
  // =====================================================
  describe("Intégration complète (happy path)", function () {
    it("Flux complet : inscriptions -> module -> affectation -> devoir -> soumission -> correction", async function () {
      await systeme.inscrireEnseignant(enseignant1.address, "Prof. Ahmed");
      await systeme.inscrireEtudiant(etudiant1.address, "Ahmed", "BDIA2025001");

      await systeme.creerModule("Blockchain", 2, enseignant1.address);
      await systeme.affecterEtudiantAuModule(1, etudiant1.address);

      const now = await time.latest();
      const dateLimite = Number(now) + 86400;

      await systeme.connect(enseignant1).creerDevoir(
        1,
        "Contrôle Final",
        "Questions",
        "PUBKEY",
        dateLimite
      );

      await systeme.connect(etudiant1).soumettreDevoir(
        1,
        "REP",
        "ID",
        "HASH_SUB",
        "rep.pdf",
        "application/pdf",
        "uri-sub",
        "AES"
      );

      await systeme.connect(enseignant1).corrigerSoumission(
        1,
        17,
        "Très bien",
        "HASH_CORR",
        "corr.pdf",
        "uri-corr"
      );

      const s = await systeme.obtenirSoumission(1);
      expect(s.estCorrige).to.equal(true);
      expect(s.note).to.equal(17);
      expect(s.fichierCorrection.nom).to.equal("corr.pdf");

      expect(await systeme.compteurModules()).to.equal(1);
      expect(await systeme.compteurDevoirs()).to.equal(1);
      expect(await systeme.compteurSoumissions()).to.equal(1);
    });
  });
});
