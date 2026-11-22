# Gera os ícones do app Android a partir do icon-512.png do Atlas Saúde.
import os, sys
from PIL import Image

origem, res = sys.argv[1], sys.argv[2]
img = Image.open(origem).convert('RGBA')
tamanhos = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dens, t in tamanhos.items():
    pasta = os.path.join(res, 'mipmap-' + dens)
    os.makedirs(pasta, exist_ok=True)
    icone = img.resize((t, t), Image.LANCZOS)
    icone.save(os.path.join(pasta, 'ic_launcher.png'))
    icone.save(os.path.join(pasta, 'ic_launcher_round.png'))
    # Ícone adaptativo: 108dp com a arte ocupando a área segura central (~62%)
    f = round(t * 108 / 48)
    fundo = Image.new('RGBA', (f, f), (0, 0, 0, 0))
    miolo = round(f * 0.62)
    fundo.paste(img.resize((miolo, miolo), Image.LANCZOS), ((f - miolo) // 2, (f - miolo) // 2))
    fundo.save(os.path.join(pasta, 'ic_launcher_foreground.png'))
print('ícones gerados')

# Tela de abertura: fundo escuro com o logo do Atlas no centro (no lugar da imagem padrão)
import glob
for caminho in glob.glob(os.path.join(res, 'drawable*', 'splash.png')):
    w, h = Image.open(caminho).size
    tela = Image.new('RGB', (w, h), (11, 16, 32))
    lado = round(min(w, h) * 0.32)
    logo = img.resize((lado, lado), Image.LANCZOS)
    tela.paste(logo, ((w - lado) // 2, (h - lado) // 2), logo)
    tela.save(caminho)
print('tela de abertura gerada')
