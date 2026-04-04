import pandas as pd
import json
import uuid
from datetime import datetime

def parse_excel(file_path):
    try:
        df = pd.read_excel(file_path, header=None)
        
        servidores = []
        for i, row in df.iterrows():
            nome = str(row[8]).strip() if pd.notnull(row[8]) else ""
            matricula = str(row[2]).strip() if pd.notnull(row[2]) else ""
            
            if not nome or nome == 'nan' or nome == 'NOME' or not matricula or matricula == 'nan' or matricula == 'Nº IDENTIFICADOR':
                continue
            
            # Formatar data de admissão (W -> 22)
            admissao_raw = str(row[22]).strip()
            admissao_iso = ""
            if admissao_raw and admissao_raw != 'nan':
                try:
                    # Tenta converter de DD/MM/YYYY para YYYY-MM-DD
                    dt = datetime.strptime(admissao_raw.split(' ')[0], "%d/%m/%Y")
                    admissao_iso = dt.strftime("%Y-%m-%d")
                except:
                    # Se falhar (ex: já estiver em outro formato), tenta parser genérico do pandas
                    try:
                        dt = pd.to_datetime(row[22])
                        admissao_iso = dt.strftime("%Y-%m-%d")
                    except:
                        admissao_iso = ""

            s = {
                "id": str(uuid.uuid4())[:8],
                "nome": nome.upper(),
                "matricula": matricula,
                "senha": "123456",
                "nascimento": "",
                "admissao": admissao_iso,
                "setor": str(row[18]).strip() if pd.notnull(row[18]) else "",
                "cargo": str(row[16]).strip() if pd.notnull(row[16]) else "",
                "telefone": "",
                "cpf": "".join(filter(str.isdigit, str(row[11]))) if pd.notnull(row[11]) else "",
                "pis": "".join(filter(str.isdigit, str(row[4]))) if pd.notnull(row[4]) else "",
                "feriasReg": 0,
                "feriasPrem": 0,
                "foto": None
            }
            
            servidores.append(s)
            
        with open('servidores_import.json', 'w', encoding='utf-8') as f:
            json.dump(servidores, f, indent=2, ensure_ascii=False)
        print(f"CONVERTED: {len(servidores)} servers saved with ISO dates.")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    parse_excel('Listagem Simples.xlsx')
