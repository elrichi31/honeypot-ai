id
whoami
cat /etc/passwd
uname -a
ls -la /home/
ls -la /var/www/html/
cat /home/ubuntu/.env
cat /etc/app/config.php
cat /home/ubuntu/.ssh/config
ssh -i /home/ubuntu/.ssh/id_rsa ubuntu@db-primary.internal
ssh -i /home/ubuntu/.ssh/id_rsa ubuntu@db-replica.internal
ssh -i /home/ubuntu/.ssh/id_rsa ubuntu@cache.internal
ssh -i /home/ubuntu/.ssh/id_rsa ubuntu@intranet.internal
ssh -i /home/ubuntu/.ssh/id_rsa ubuntu@fileserver.internal
mysql -h db-primary.internal -u app_user app_production
mysql -h db-primary.internal -u app_user app_production -e "SHOW DATABASES;"
mysql -h db-primary.internal -u app_user app_production -e "SELECT user, host FROM mysql.user;"
scp /tmp/backup.sql ubuntu@fileserver.internal:/mnt/shared/backups/
ls -la /tmp/
cat /etc/crontab
crontab -l
netstat -tlnp
ss -tlnp
ps aux
last
who
arp -n
ifconfig
ip route
exit
