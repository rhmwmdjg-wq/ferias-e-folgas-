import os

target_file = r"c:\Users\ruanp\Downloads\teste apk ferias novo\ferias-servidores-v3-responsivo.html"

with open(target_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_logic = """        if (sol.periodos && sol.periodos.length > 0) {
          sol.periodos.forEach((p, pIdx) => {
            progs.push({
              id: uid(), srvId: sol.srvId, solId: sol.id,
              tipo: sol.tipo === 'ferias_anual' ? 'anual' : 'premio',
              inicio: p.inicio, fim: p.fim, retorno: p.fim,
              obs: `Autorizado via Solicitação (${pIdx+1}/${sol.periodos.length}). ${sol.obs || ''}`,
              criadoEm: new Date().toISOString()
            });
          });
        } else {
          progs.push({
            id: uid(), srvId: sol.srvId, solId: sol.id,
            tipo: sol.tipo === 'ferias_anual' ? 'anual' : 'premio',
            inicio: sol.inicio, fim: sol.fim, retorno: sol.fim,
            obs: `Autorizado via Solicitação. ${sol.obs || ''}`,
            criadoEm: new Date().toISOString()
          });
        }
"""

with open(target_file, 'w', encoding='utf-8') as f:
    i = 0
    while i < len(lines):
        line = lines[i]
        # Match the start of the push logic
        if "progs.push({" in line and i + 5 < len(lines) and "Autorizado via Solicitação" in lines[i+4]:
             # Replace lines i to i+6 (progs.push to });)
             f.write(new_logic)
             i += 7 # Skip the progs.push block
        else:
             f.write(line)
             i += 1

print("Replacement complete.")
