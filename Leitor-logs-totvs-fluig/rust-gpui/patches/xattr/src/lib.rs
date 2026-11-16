use std::ffi::OsStr;
use std::io;
use std::path::Path;

/// Stub compatível para substituir `xattr 0.2.3` (incompatível com `libc >= 0.2.165` no Linux).
/// Usado apenas transitivamente por `zed-async-tar` em descompactação POSIX com atributos estendidos.
pub fn set<P: AsRef<Path>, N: AsRef<OsStr>>(
    _path: P,
    _name: N,
    _value: &[u8],
) -> io::Result<()> {
    Ok(())
}
