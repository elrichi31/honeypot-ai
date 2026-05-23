ls -la
cd /var/www/html
ls -la wp-content/
sudo service apache2 status
sudo service mysql status
cd /home/ubuntu
df -h
free -m
uptime
w
sudo tail -n 50 /var/log/apache2/error.log
cat /home/ubuntu/.env
cat /etc/app/config.php
ssh db-primary
ssh db-replica
ssh cache
ssh intranet
ssh fileserver
redis-cli -h cache.internal ping
redis-cli -h cache.internal info
mysql -h db-primary.internal -u app_user app_production
mysql -h db-replica.internal -u app_readonly app_production -e "SHOW SLAVE STATUS\G"
scp ubuntu@fileserver.internal:/mnt/shared/backups/db_20240312.sql.gz /tmp/
ls /mnt/shared/backups/
netstat -tlnp
ss -tlnp
ps aux | grep apache
arp -n
ifconfig
exit
