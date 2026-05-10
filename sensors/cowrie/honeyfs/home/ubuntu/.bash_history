ls -la
cd /var/www/html
ls -la wp-content/
sudo service apache2 status
sudo service mysql status
mysql -u wpuser -p
sudo nano /etc/apache2/sites-enabled/000-default.conf
sudo systemctl reload apache2
cd /home/ubuntu
df -h
free -m
uptime
w
sudo tail -n 50 /var/log/apache2/error.log
sudo tail -f /var/log/apache2/access.log
sudo apt update
sudo apt upgrade -y
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo certbot renew --dry-run
ls /var/www/html/wp-content/plugins/
sudo chown -R www-data:www-data /var/www/html/
sudo find /var/www/html -name "*.php" -type f | wc -l
ps aux | grep apache
netstat -tlnp
ss -tlnp
cat /etc/mysql/mysql.conf.d/mysqld.cnf | grep bind
tar -czf /home/ubuntu/backup_$(date +%Y%m%d).tar.gz /var/www/html/wp-content/
ls -lh backup_*.tar.gz
exit
