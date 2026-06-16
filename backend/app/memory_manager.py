import os
import chromadb
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory_db")

class MemoryManager:
    def __init__(self):
        # Initialize chroma client with persistent storage
        self.client = chromadb.PersistentClient(path=DB_PATH)
        
        # Create or get collections
        self.preferences = self.client.get_or_create_collection("user_preferences")
        
    def add_memory(self, user_id: str, content: str):
        """Add a memory fragment"""
        doc_id = f"mem_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        self.preferences.add(
            documents=[content],
            metadatas=[{"user_id": user_id, "timestamp": datetime.now().isoformat()}],
            ids=[doc_id]
        )
        return doc_id
        
    def query_memory(self, user_id: str, query: str, n_results: int = 3):
        """Query relevant memory fragments based on similarity"""
        try:
            # Check if collection is empty
            if self.preferences.count() == 0:
                return []
                
            results = self.preferences.query(
                query_texts=[query],
                n_results=min(n_results, self.preferences.count()),
                where={"user_id": user_id}
            )
            
            # results["documents"] is a list of lists.
            if results and results["documents"] and len(results["documents"][0]) > 0:
                return results["documents"][0]
            return []
        except Exception as e:
            print(f"Memory query error: {e}")
            return []

# Singleton instance
memory_manager = MemoryManager()
