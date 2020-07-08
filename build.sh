set -e
hugo --minify
cd public
cp -r *.html *.xml css blog page tags images ..
