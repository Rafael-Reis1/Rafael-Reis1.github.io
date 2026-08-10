document.addEventListener('DOMContentLoaded', function() {
    const cpfInput = document.getElementById('cpfInput');
    if (cpfInput) {
        cpfInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 11) value = value.slice(0, 11);
            
            if (value.length > 9) {
                value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
            } else if (value.length > 6) {
                value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
            } else if (value.length > 3) {
                value = value.replace(/(\d{3})(\d{1,3})/, "$1.$2");
            }
            
            e.target.value = value;
        });
    }

    if (typeof showSection === 'function' && document.getElementById('inicial-section')) {
        showSection('inicial');
    }
});

function login() {
    window.location.href = 'painel.html';
}

function showSection(sectionId) {
    $('#inicial-section').hide();
    $('#resumo-section').hide();
    $('#questionario-section').hide();
    $('#cadastro-section').hide();
    
    if (sectionId === 'inicial') {
        $('#inicial-section').show();
    } else if (sectionId === 'resumo') {
        $('#resumo-section').show();
    } else if (sectionId === 'questionario') {
        $('#questionario-section').show();
        window.scrollTo(0, 0);
    } else if (sectionId === 'cadastro') {
        $('#cadastro-section').show();
    }
    
    $('.sidebar .nav li').removeClass('active');
    $('.sidebar .nav a').each(function() {
        if ($(this).attr('onclick') && $(this).attr('onclick').includes(sectionId)) {
            $(this).parent('li').addClass('active');
            
            let parentUl = $(this).closest('ul');
            if (parentUl.parent('li').length > 0) {
                parentUl.parent('li').addClass('active');
            }
        }
    });
}

function salvarParcial() {
    mostrarModal('Suas respostas foram salvas parcialmente com sucesso.');
    showSection('inicial');
}

function finalizar() {
    mostrarModal('Questionário finalizado e enviado com sucesso! Obrigado por participar do Enade 2026.');
    showSection('inicial');
}

function mostrarModal(mensagem) {
    $('#modal-message').text(mensagem);
    $('#feedbackModal').modal('show');
}

function naoImplementado(feature) {
    mostrarModal('Essa tela (' + feature + ') ainda não foi implementada no protótipo estático.');
}
