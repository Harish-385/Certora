// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CertificateRegistry {

    struct Certificate {
        bytes32 nameHash;     // cheaper than string
        bytes32 ipfsHash;     // store CID hash instead of full string
        uint64 issueDate;     // smaller type (saves gas)
        bool isValid;
    }

    mapping(bytes32 => Certificate) public certificates;

    uint256 public totalIssued;
    address public immutable admin; // immutable = cheaper gas

    event CertificateIssued(bytes32 indexed uniqueId, bytes32 nameHash, uint64 issueDate);
    event CertificateRevoked(bytes32 indexed uniqueId);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    // Pass hashed values from frontend
    function issueCertificate(
        bytes32 _uniqueId,
        bytes32 _nameHash,
        bytes32 _ipfsHash
    ) external onlyAdmin {

        require(!certificates[_uniqueId].isValid, "Exists");

        certificates[_uniqueId] = Certificate({
            nameHash: _nameHash,
            ipfsHash: _ipfsHash,
            issueDate: uint64(block.timestamp),
            isValid: true
        });

        unchecked { totalIssued++; } // saves gas

        emit CertificateIssued(_uniqueId, _nameHash, uint64(block.timestamp));
    }

    function verifyCertificate(bytes32 _uniqueId)
        external
        view
        returns (bool, bytes32, bytes32, uint64)
    {
        Certificate storage cert = certificates[_uniqueId];
        return (cert.isValid, cert.nameHash, cert.ipfsHash, cert.issueDate);
    }

    function revokeCertificate(bytes32 _uniqueId) external onlyAdmin {
        Certificate storage cert = certificates[_uniqueId];
        require(cert.isValid, "Invalid");

        cert.isValid = false;

        emit CertificateRevoked(_uniqueId);
    }
}