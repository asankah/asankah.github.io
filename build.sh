set -e
cd content
hugo
cd public
cp -r *.html *.xml css blog categories page tags images ../..
