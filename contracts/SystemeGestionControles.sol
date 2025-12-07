// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SystemeGestionControles
 * @dev Système de gestion des devoirs et contrôles basé sur blockchain
 */
contract SystemeGestionControles {
    
    // Structures de données
    struct Enseignant {
        address adresse;
        string nom;
        string clePublique;
        bool estActif;
        uint256 dateInscription;
    }
    
    struct Etudiant {
        address adresse;
        string nom;
        string numeroEtudiant;
        bool estActif;
        uint256 dateInscription;
    }
    
    struct Devoir {
        uint256 id;
        address enseignant;
        string titre;
        string description;
        string clePubliqueChiffrement;
        uint256 dateCreation;
        uint256 dateLimite;
        bool estActif;
    }
    
    struct Soumission {
        uint256 id;
        uint256 devoirId;
        address etudiant;
        string contenuChiffre; // Réponses chiffrées avec la clé publique
        string identiteChiffree; // Identité de l'étudiant chiffrée
        uint256 dateSubmission;
        bool estCorrige;
        uint256 note;
        string commentaire;
    }
    
    struct Annonce {
        uint256 id;
        address auteur;
        string titre;
        string contenu;
        uint256 dateCreation;
        bool estPublique;
    }
    
    // Variables d'état
    address public administrateur;
    
    mapping(address => Enseignant) public enseignants;
    mapping(address => Etudiant) public etudiants;
    mapping(uint256 => Devoir) public devoirs;
    mapping(uint256 => Soumission) public soumissions;
    mapping(uint256 => Annonce) public annonces;
    
    address[] public listeEnseignants;
    address[] public listeEtudiants;
    uint256[] public listeDevoirs;
    uint256[] public listeSoumissions;
    uint256[] public listeAnnonces;
    
    uint256 public compteurDevoirs;
    uint256 public compteurSoumissions;
    uint256 public compteurAnnonces;
    
    // Mapping pour retrouver les soumissions d'un devoir
    mapping(uint256 => uint256[]) public soumissionsParDevoir;
    
    // Mapping pour retrouver les soumissions d'un étudiant
    mapping(address => uint256[]) public soumissionsParEtudiant;
    
    // Événements
    event EnseignantInscrit(address indexed adresse, string nom);
    event EtudiantInscrit(address indexed adresse, string nom, string numeroEtudiant);
    event DevoirCree(uint256 indexed devoirId, address indexed enseignant, string titre);
    event SoumissionEnvoyee(uint256 indexed soumissionId, uint256 indexed devoirId, address indexed etudiant);
    event SoumissionCorrigee(uint256 indexed soumissionId, uint256 note);
    event AnnoncePubliee(uint256 indexed annonceId, address indexed auteur, string titre);
    
    // Modificateurs
    modifier seulementAdmin() {
        require(msg.sender == administrateur, "Seul l'administrateur peut executer cette action");
        _;
    }
    
    modifier seulementEnseignant() {
        require(enseignants[msg.sender].estActif, "Seul un enseignant peut executer cette action");
        _;
    }
    
    modifier seulementEtudiant() {
        require(etudiants[msg.sender].estActif, "Seul un etudiant peut executer cette action");
        _;
    }
    
    modifier devoirExiste(uint256 _devoirId) {
        require(devoirs[_devoirId].estActif, "Le devoir n'existe pas");
        _;
    }
    
    constructor() {
        administrateur = msg.sender;
    }
    
    // Fonctions d'inscription
    function inscrireEnseignant(address _adresse, string memory _nom, string memory _clePublique) 
        public 
        seulementAdmin 
    {
        require(!enseignants[_adresse].estActif, "Enseignant deja inscrit");
        
        enseignants[_adresse] = Enseignant({
            adresse: _adresse,
            nom: _nom,
            clePublique: _clePublique,
            estActif: true,
            dateInscription: block.timestamp
        });
        
        listeEnseignants.push(_adresse);
        emit EnseignantInscrit(_adresse, _nom);
    }
    
    function inscrireEtudiant(address _adresse, string memory _nom, string memory _numeroEtudiant) 
        public 
        seulementAdmin 
    {
        require(!etudiants[_adresse].estActif, "Etudiant deja inscrit");
        
        etudiants[_adresse] = Etudiant({
            adresse: _adresse,
            nom: _nom,
            numeroEtudiant: _numeroEtudiant,
            estActif: true,
            dateInscription: block.timestamp
        });
        
        listeEtudiants.push(_adresse);
        emit EtudiantInscrit(_adresse, _nom, _numeroEtudiant);
    }
    
    // Fonctions de gestion des devoirs
    function creerDevoir(
        string memory _titre,
        string memory _description,
        string memory _clePubliqueChiffrement,
        uint256 _dateLimite
    ) 
        public 
        seulementEnseignant 
        returns (uint256)
    {
        require(_dateLimite > block.timestamp, "La date limite doit etre dans le futur");
        
        compteurDevoirs++;
        
        devoirs[compteurDevoirs] = Devoir({
            id: compteurDevoirs,
            enseignant: msg.sender,
            titre: _titre,
            description: _description,
            clePubliqueChiffrement: _clePubliqueChiffrement,
            dateCreation: block.timestamp,
            dateLimite: _dateLimite,
            estActif: true
        });
        
        listeDevoirs.push(compteurDevoirs);
        emit DevoirCree(compteurDevoirs, msg.sender, _titre);
        
        return compteurDevoirs;
    }
    
    // Fonction de soumission de devoir
    function soumettreDevoir(
        uint256 _devoirId,
        string memory _contenuChiffre,
        string memory _identiteChiffree
    ) 
        public 
        seulementEtudiant 
        devoirExiste(_devoirId)
        returns (uint256)
    {
        require(block.timestamp <= devoirs[_devoirId].dateLimite, "La date limite est depassee");
        
        compteurSoumissions++;
        
        soumissions[compteurSoumissions] = Soumission({
            id: compteurSoumissions,
            devoirId: _devoirId,
            etudiant: msg.sender,
            contenuChiffre: _contenuChiffre,
            identiteChiffree: _identiteChiffree,
            dateSubmission: block.timestamp,
            estCorrige: false,
            note: 0,
            commentaire: ""
        });
        
        listeSoumissions.push(compteurSoumissions);
        soumissionsParDevoir[_devoirId].push(compteurSoumissions);
        soumissionsParEtudiant[msg.sender].push(compteurSoumissions);
        
        emit SoumissionEnvoyee(compteurSoumissions, _devoirId, msg.sender);
        
        return compteurSoumissions;
    }
    
    // Fonction de correction (enseignant)
    function corrigerSoumission(
        uint256 _soumissionId,
        uint256 _note,
        string memory _commentaire
    ) 
        public 
        seulementEnseignant 
    {
        Soumission storage soumission = soumissions[_soumissionId];
        require(soumission.id > 0, "Soumission inexistante");
        
        Devoir storage devoir = devoirs[soumission.devoirId];
        require(devoir.enseignant == msg.sender, "Vous n'etes pas l'enseignant de ce devoir");
        
        soumission.estCorrige = true;
        soumission.note = _note;
        soumission.commentaire = _commentaire;
        
        emit SoumissionCorrigee(_soumissionId, _note);
    }
    
    // Fonction de publication d'annonce
    function publierAnnonce(
        string memory _titre,
        string memory _contenu,
        bool _estPublique
    ) 
        public 
        returns (uint256)
    {
        require(
            enseignants[msg.sender].estActif || etudiants[msg.sender].estActif,
            "Seuls les membres inscrits peuvent publier"
        );
        
        compteurAnnonces++;
        
        annonces[compteurAnnonces] = Annonce({
            id: compteurAnnonces,
            auteur: msg.sender,
            titre: _titre,
            contenu: _contenu,
            dateCreation: block.timestamp,
            estPublique: _estPublique
        });
        
        listeAnnonces.push(compteurAnnonces);
        emit AnnoncePubliee(compteurAnnonces, msg.sender, _titre);
        
        return compteurAnnonces;
    }
    
    // Fonctions de lecture
    function obtenirDevoir(uint256 _devoirId) 
        public 
        view 
        returns (Devoir memory) 
    {
        return devoirs[_devoirId];
    }
    
    function obtenirSoumission(uint256 _soumissionId) 
        public 
        view 
        returns (Soumission memory) 
    {
        return soumissions[_soumissionId];
    }
    
    function obtenirSoumissionsDevoir(uint256 _devoirId) 
        public 
        view 
        returns (uint256[] memory) 
    {
        return soumissionsParDevoir[_devoirId];
    }
    
    function obtenirSoumissionsEtudiant(address _etudiant) 
        public 
        view 
        returns (uint256[] memory) 
    {
        return soumissionsParEtudiant[_etudiant];
    }
    
    function obtenirTousLesDevoirs() 
        public 
        view 
        returns (uint256[] memory) 
    {
        return listeDevoirs;
    }
    
    function obtenirToutesLesAnnonces() 
        public 
        view 
        returns (uint256[] memory) 
    {
        return listeAnnonces;
    }
    
    function estEnseignant(address _adresse) 
        public 
        view 
        returns (bool) 
    {
        return enseignants[_adresse].estActif;
    }
    
    function estEtudiant(address _adresse) 
        public 
        view 
        returns (bool) 
    {
        return etudiants[_adresse].estActif;
    }
}