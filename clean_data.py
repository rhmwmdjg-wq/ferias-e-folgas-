import json
import uuid

def clean_json(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        cleaned = []
        for s in data:
            # Ensure name and matricula exist
            if not s.get('nome') or not s.get('matricula'):
                continue
            
            # Add uid if missing
            if not s.get('id'):
                s['id'] = str(uuid.uuid4())[:8]
            
            # Default values for strings
            for k in ['nascimento', 'admissao', 'setor', 'cargo', 'telefone', 'cpf', 'pis']:
                if s.get(k) is None: s[k] = ""
            
            # Default values for numbers
            for k in ['feriasReg', 'feriasPrem']:
                if s.get(k) is None: s[k] = 0
            
            cleaned.append(s)
            
        with open('servidores_import.json', 'w', encoding='utf-8') as f:
            json.dump(cleaned, f, indent=2, ensure_ascii=False)
        print(f"CLEANED: {len(cleaned)} servers saved to 'servidores_import.json'.")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    clean_json('servidores_import.json')
