set -e
export PATH=$HOME/.cabal/bin:$HOME/venv-root/user/bin:$PATH
hugo --minify
cd public
cp -r *.html *.xml css blog page tags images ..
