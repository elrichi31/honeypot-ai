import calendar
import time

from impacket import smb, smb3structs as smb2
from impacket.nt_errors import STATUS_SUCCESS
from impacket.smbserver import SMB2Commands, SMBCommands
from impacket.spnego import SPNEGO_NegTokenInit, TypesMech

from .capture import _mark_write, _finalize_capture


def _posix_to_filetime(epoch_seconds: int) -> int:
    # Windows FILETIME = 100ns ticks since 1601-01-01 UTC.
    return int((epoch_seconds + 11644473600) * 10_000_000)


def patch_impacket_writes():
    smb1_write = SMBCommands.smbComWrite
    smb1_write_andx = SMBCommands.smbComWriteAndX
    smb1_close = SMBCommands.smbComClose
    smb2_write = SMB2Commands.smb2Write
    smb2_close = SMB2Commands.smb2Close

    def patched_smb1_write(connId, smbServer, SMBCommand, recvPacket):
        connData = smbServer.getConnectionData(connId)
        params = smb.SMBWrite_Parameters(SMBCommand["Parameters"])
        resp = smb1_write(connId, smbServer, SMBCommand, recvPacket)
        if recvPacket["Tid"] in connData.get("ConnectedShares", {}) and params["Fid"] in connData.get("OpenedFiles", {}):
            _mark_write(connData, params["Fid"], int(params["Count"]))
            smbServer.setConnectionData(connId, connData)
        return resp

    def patched_smb1_write_andx(connId, smbServer, SMBCommand, recvPacket):
        connData = smbServer.getConnectionData(connId)
        if SMBCommand["WordCount"] == 0x0C:
            writeAndX = smb.SMBWriteAndX_Parameters_Short(SMBCommand["Parameters"])
        else:
            writeAndX = smb.SMBWriteAndX_Parameters(SMBCommand["Parameters"])
        data_len = int(writeAndX["DataLength"])
        fid = writeAndX["Fid"]
        resp = smb1_write_andx(connId, smbServer, SMBCommand, recvPacket)
        if recvPacket["Tid"] in connData.get("ConnectedShares", {}) and fid in connData.get("OpenedFiles", {}):
            _mark_write(connData, fid, data_len)
            smbServer.setConnectionData(connId, connData)
        return resp

    def patched_smb1_close(connId, smbServer, SMBCommand, recvPacket):
        connData = smbServer.getConnectionData(connId)
        params = smb.SMBClose_Parameters(SMBCommand["Parameters"])
        _finalize_capture(connData, params["FID"], recvPacket["Tid"])
        return smb1_close(connId, smbServer, SMBCommand, recvPacket)

    def patched_smb2_write(connId, smbServer, recvPacket):
        connData = smbServer.getConnectionData(connId)
        writeRequest = smb2.SMB2Write(recvPacket["Data"])
        if writeRequest["FileID"].getData() == b"\xff" * 16 and "SMB2_CREATE" in connData.get("LastRequest", {}):
            file_id = connData["LastRequest"]["SMB2_CREATE"]["FileID"]
        else:
            file_id = writeRequest["FileID"].getData()
        resp = smb2_write(connId, smbServer, recvPacket)
        if recvPacket["TreeID"] in connData.get("ConnectedShares", {}) and file_id in connData.get("OpenedFiles", {}):
            _mark_write(connData, file_id, int(writeRequest["Length"]))
            smbServer.setConnectionData(connId, connData)
        return resp

    def patched_smb2_close(connId, smbServer, recvPacket):
        connData = smbServer.getConnectionData(connId)
        closeRequest = smb2.SMB2Close(recvPacket["Data"])
        if closeRequest["FileID"].getData() == b"\xff" * 16 and "SMB2_CREATE" in connData.get("LastRequest", {}):
            file_id = connData["LastRequest"]["SMB2_CREATE"]["FileID"]
        else:
            file_id = closeRequest["FileID"].getData()
        _finalize_capture(connData, file_id, recvPacket["TreeID"])
        return smb2_close(connId, smbServer, recvPacket)

    SMBCommands.smbComWrite = staticmethod(patched_smb1_write)
    SMBCommands.smbComWriteAndX = staticmethod(patched_smb1_write_andx)
    SMBCommands.smbComClose = staticmethod(patched_smb1_close)
    SMB2Commands.smb2Write = staticmethod(patched_smb2_write)
    SMB2Commands.smb2Close = staticmethod(patched_smb2_close)


def patch_smb2_negotiate(server_guid: bytes):
    original = SMB2Commands.smb2Negotiate

    def patched_smb2_negotiate(connId, smbServer, recvPacket, isSMB1=False):
        if isSMB1 is False:
            return original(connId, smbServer, recvPacket, isSMB1)

        connData = smbServer.getConnectionData(connId, checkStatus=False)
        respPacket = smb2.SMB2Packet()
        respPacket["Flags"] = smb2.SMB2_FLAGS_SERVER_TO_REDIR
        respPacket["Status"] = STATUS_SUCCESS
        respPacket["CreditRequestResponse"] = 1
        respPacket["Command"] = smb2.SMB2_NEGOTIATE
        respPacket["SessionID"] = 0
        respPacket["MessageID"] = 0
        respPacket["TreeID"] = 0

        respSMBCommand = smb2.SMB2Negotiate_Response()
        respSMBCommand["SecurityMode"] = 1

        smb_command = smb.SMBCommand(recvPacket["Data"][0])
        dialects = [part.strip(b"\x00") for part in smb_command["Data"].split(b"\x02") if part]
        supports_modern_smb = any(d.startswith((b"SMB 2", b"SMB 3")) for d in dialects)
        if not supports_modern_smb:
            raise Exception("SMB2 not supported, fallbacking")

        # Impacket's smbserver behaves reliably as SMB 2.0.2; SERVER_OS defaults to
        # "Windows Server 2008 R2" to match this dialect (see Tarea 2.2).
        respSMBCommand["DialectRevision"] = smb2.SMB2_DIALECT_002
        respSMBCommand["ServerGuid"] = server_guid
        respSMBCommand["Capabilities"] = 0
        respSMBCommand["MaxTransactSize"] = 65536
        respSMBCommand["MaxReadSize"] = 65536
        respSMBCommand["MaxWriteSize"] = 65536
        now_ft = _posix_to_filetime(calendar.timegm(time.gmtime()))
        respSMBCommand["SystemTime"] = now_ft
        respSMBCommand["ServerStartTime"] = now_ft
        respSMBCommand["SecurityBufferOffset"] = 0x80

        blob = SPNEGO_NegTokenInit()
        blob["MechTypes"] = [TypesMech["NTLMSSP - Microsoft NTLM Security Support Provider"]]

        respSMBCommand["Buffer"] = blob.getData()
        respSMBCommand["SecurityBufferLength"] = len(respSMBCommand["Buffer"])
        respPacket["Data"] = respSMBCommand

        smbServer.setConnectionData(connId, connData)
        return None, [respPacket], STATUS_SUCCESS

    SMB2Commands.smb2Negotiate = staticmethod(patched_smb2_negotiate)
