import os
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# Sepolia Public RPC (Free - no API key needed)
SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")

# Connect to Sepolia Testnet
w3 = Web3(Web3.HTTPProvider(SEPOLIA_RPC_URL))

# ABI from the actual deployed bytes32-based contract
CONTRACT_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {"internalType": "bytes32", "name": "_uniqueId", "type": "bytes32"},
      {"internalType": "bytes32", "name": "_nameHash", "type": "bytes32"},
      {"internalType": "bytes32", "name": "_ipfsHash", "type": "bytes32"}
    ],
    "name": "issueCertificate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "_uniqueId", "type": "bytes32"}],
    "name": "revokeCertificate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "_uniqueId", "type": "bytes32"}],
    "name": "verifyCertificate",
    "outputs": [
      {"internalType": "bool",    "name": "", "type": "bool"},
      {"internalType": "bytes32", "name": "", "type": "bytes32"},
      {"internalType": "bytes32", "name": "", "type": "bytes32"},
      {"internalType": "uint64",  "name": "", "type": "uint64"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

def is_blockchain_ready():
    connected = w3.is_connected()
    has_address = bool(CONTRACT_ADDRESS and len(CONTRACT_ADDRESS) == 42)
    return connected and has_address

def str_to_bytes32(text):
    """Converts a plain string into a zero-padded bytes32 value."""
    encoded = text.encode("utf-8")
    return encoded[:32].ljust(32, b"\x00")

def bytes32_to_str(b):
    """Converts a bytes32 value back to a clean readable string."""
    if isinstance(b, bytes):
        return b.rstrip(b"\x00").decode("utf-8", errors="replace")
    return str(b)

def verify_certificate_on_chain(unique_id):
    """
    Read-Only call to Sepolia - completely FREE, no gas needed.
    Converts unique_id to bytes32, calls the contract, decodes results.
    """
    if not is_blockchain_ready():
        return {
            "error": f"Blockchain not reachable. Connected={w3.is_connected()}, Address='{CONTRACT_ADDRESS}'"
        }
    try:
        contract = w3.eth.contract(
            address=w3.to_checksum_address(CONTRACT_ADDRESS),
            abi=CONTRACT_ABI
        )
        unique_id_bytes = str_to_bytes32(str(unique_id))
        is_valid, name_hash_bytes, ipfs_hash_bytes, date_issued = \
            contract.functions.verifyCertificate(unique_id_bytes).call()
        return {
            "isValid": is_valid,
            "nameHash": bytes32_to_str(name_hash_bytes),
            "ipfsHash": bytes32_to_str(ipfs_hash_bytes),
            "timestamp": date_issued
        }
    except Exception as e:
        return {"error": str(e)}
