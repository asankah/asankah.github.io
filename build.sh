set -e
cd content
hugo --minify
cd public
cp -r *.html *.xml css blog categories page tags images ../..
